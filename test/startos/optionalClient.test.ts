import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, it, type TestContext } from 'node:test'
import { configureDomain } from '../../startos/actions/configureDomain'
import { configureSmtp } from '../../startos/actions/configureSmtp'
import { setAdminPassword } from '../../startos/actions/setAdminPassword'
import { storeJson, storeShape } from '../../startos/fileModels/store.json'
import { inbucketEnvironment } from '../../startos/inbucketEnvironment'
import { watchCredentials } from '../../startos/init/watchCredentials'
import { setInterfaces } from '../../startos/interfaces'
import { main } from '../../startos/main'
import { sdk } from '../../startos/sdk'

type Effects = Parameters<typeof configureDomain.getInput>[0]['effects']
type Task = Parameters<Effects['action']['createTask']>[0]
type ServiceInterface = Parameters<Effects['exportServiceInterface']>[0]
type Binding = Parameters<Effects['bind']>[0]

const existingConfig = {
  domain: 'mail.example.com',
  retentionPeriod: '1h',
  mailboxMessageCap: 300,
  maxMessageSizeMb: 50,
  databasePassword: 'd'.repeat(32),
  secretKeyBase: 's'.repeat(64),
  adminUsername: 'admin',
  adminPassword: 'p'.repeat(16),
  luaEventToken: 't'.repeat(48),
  smtp: { selection: 'system', value: { customFrom: 'mail@example.com' } },
  extension: { retained: true },
}

const configurationInput = {
  domain: 'mail.example.com',
  retentionPeriod: '1h' as const,
  mailboxMessageCap: 300,
  maxMessageSizeMb: 50,
}

function startOsState(t: TestContext) {
  const tasks = new Map<string, Task>()
  const interfaces = new Map<string, ServiceInterface>()
  const bindings = new Map<string, Binding>()
  const effects = {
    eventId: 'optional-client-test',
    get isInContext() {
      return !t.signal.aborted
    },
    child: () =>
      Object.defineProperty({ ...effects }, 'isInContext', {
        get: () => !t.signal.aborted,
      }),
    getSystemSmtp: async () => null,
    action: {
      export: async () => null,
      createTask: async (task: Task) => {
        tasks.set(task.replayId, task)
        return null
      },
      clearTasks: async ({ only }: { only: string[] }) => {
        for (const id of only) tasks.delete(id)
        return null
      },
    },
    bind: async (binding: Binding) => {
      bindings.set(`${binding.id}:${binding.internalPort}`, binding)
      return null
    },
    clearBindings: async ({
      except,
    }: Parameters<Effects['clearBindings']>[0]) => {
      const remaining = new Set(
        except.map(({ id, internalPort }) => `${id}:${internalPort}`),
      )
      for (const id of bindings.keys()) {
        if (!remaining.has(id)) bindings.delete(id)
      }
      return null
    },
    exportServiceInterface: async (value: ServiceInterface) => {
      interfaces.set(value.id, value)
      return null
    },
    clearServiceInterfaces: async ({ except }: { except: string[] }) => {
      for (const id of interfaces.keys()) {
        if (!except.includes(id)) interfaces.delete(id)
      }
      return null
    },
  } as unknown as Effects
  return { effects, tasks, interfaces, bindings }
}

async function isolateVolume(t: TestContext) {
  const directory = await fs.mkdtemp(
    path.join(tmpdir(), 'inbucket-client-test-'),
  )
  const volume = sdk.volumes.main.subpath('')
  const resolve = (file: unknown) =>
    typeof file === 'string' && file.startsWith(volume)
      ? path.join(directory, file.slice(volume.length))
      : file

  for (const method of ['access', 'readFile', 'writeFile', 'mkdir'] as const) {
    const original = fs[method].bind(fs) as (
      file: unknown,
      ...args: unknown[]
    ) => Promise<unknown>
    t.mock.method(fs, method, (file: unknown, ...args: unknown[]) =>
      original(resolve(file), ...args),
    )
  }
  t.mock.method(
    fs,
    'watch',
    (_file: unknown, options: { signal?: AbortSignal }) =>
      (async function* () {
        await new Promise<void>((done) => {
          if (options?.signal?.aborted || t.signal.aborted) return done()
          options?.signal?.addEventListener('abort', () => done(), {
            once: true,
          })
          t.signal.addEventListener('abort', () => done(), { once: true })
        })
      })(),
  )
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
}

describe('optional authenticated client', () => {
  beforeEach((t) => isolateVolume(t as TestContext))

  it('keeps the client enabled for fresh, legacy, and invalid configurations', () => {
    assert.deepEqual(storeShape.parse({}).client, { enabled: true })
    assert.deepEqual(storeShape.parse(existingConfig).client, { enabled: true })
    for (const client of [null, false, {}, { enabled: 'false' }]) {
      assert.equal(
        storeShape.parse({ ...existingConfig, client }).client.enabled,
        true,
      )
    }
    assert.equal(
      storeShape.parse({ ...existingConfig, client: { enabled: false } }).client
        .enabled,
      false,
    )
  })

  it('offers enabled by default and prefills the saved client choice', async (t) => {
    const { effects } = startOsState(t)
    const fresh = await configureDomain.getInput({ effects, prefill: null })
    assert.equal(
      (fresh.spec.clientEnabled as { default: boolean }).default,
      true,
    )
    assert.equal(fresh.value?.clientEnabled, true)

    await storeJson.write(effects, storeShape.parse(existingConfig))
    assert.equal(
      (await configureDomain.getInput({ effects, prefill: null })).value
        ?.clientEnabled,
      true,
    )

    await storeJson.merge(effects, { client: { enabled: false } })
    assert.equal(
      (await configureDomain.getInput({ effects, prefill: null })).value
        ?.clientEnabled,
      false,
    )
  })

  it('preserves credentials and SMTP settings when disabling and re-enabling', async (t) => {
    const { effects } = startOsState(t)
    const original = storeShape.parse({
      ...existingConfig,
      client: { enabled: true, extension: 'retained' },
    })
    await storeJson.write(effects, original)

    for (const clientEnabled of [false, true]) {
      await configureDomain.getInput({ effects, prefill: null })
      const result = await configureDomain.run({
        effects,
        input: { ...configurationInput, clientEnabled },
      })
      assert.ok(result?.version === '1')
      assert.equal(result.title, 'Configuration Saved')
      assert.deepEqual(await storeJson.read().once(), {
        ...original,
        client: { enabled: clientEnabled, extension: 'retained' },
      })
    }
  })

  it('hides client-only actions while disabled and rejects direct submissions', async (t) => {
    const { effects } = startOsState(t)
    const original = storeShape.parse({
      ...existingConfig,
      client: { enabled: false },
    })
    await storeJson.write(effects, original)

    assert.equal(
      (await setAdminPassword.exportMetadata({ effects })).visibility,
      'hidden',
    )
    assert.equal(
      (await configureSmtp.exportMetadata({ effects })).visibility,
      'hidden',
    )
    await configureSmtp.getInput({ effects, prefill: null })
    await assert.rejects(
      setAdminPassword.run({ effects, input: {} }),
      /Enable the authenticated client before setting its password/,
    )
    await assert.rejects(
      configureSmtp.run({
        effects,
        input: { smtp: { selection: 'disabled', value: {} } },
      }),
      /Enable the authenticated client before configuring notification SMTP/,
    )
    assert.deepEqual(await storeJson.read().once(), original)

    await storeJson.merge(effects, { client: { enabled: true } })
    assert.equal(
      (await setAdminPassword.exportMetadata({ effects })).visibility,
      'enabled',
    )
    assert.equal(
      (await configureSmtp.exportMetadata({ effects })).visibility,
      'enabled',
    )
  })

  it('clears the password task while disabled and restores it when needed', async (t) => {
    const { effects, tasks } = startOsState(t)
    await storeJson.write(
      effects,
      storeShape.parse({ ...existingConfig, adminPassword: '' }),
    )
    await watchCredentials.init(effects, null)
    assert.equal(tasks.get('inbucket:set-admin-password')?.severity, 'critical')

    await storeJson.merge(effects, { client: { enabled: false } })
    await watchCredentials.init(effects, null)
    assert.equal(tasks.has('inbucket:set-admin-password'), false)

    await storeJson.merge(effects, { client: { enabled: true } })
    await watchCredentials.init(effects, null)
    assert.equal(tasks.get('inbucket:set-admin-password')?.severity, 'critical')

    await storeJson.merge(effects, {
      adminPassword: existingConfig.adminPassword,
    })
    await watchCredentials.init(effects, null)
    assert.equal(tasks.has('inbucket:set-admin-password'), false)
  })

  it('removes only client interfaces and bindings and restores them when enabled', async (t) => {
    const { effects, interfaces, bindings } = startOsState(t)
    await storeJson.write(effects, storeShape.parse(existingConfig))
    await setInterfaces(effects)
    const originalInterfaces = new Map(interfaces)
    const originalBindings = new Map(bindings)
    assert.deepEqual([...interfaces.keys()].sort(), [
      'client',
      'rest-api',
      'smtp',
      'ui',
    ])

    await storeJson.merge(effects, { client: { enabled: false } })
    await setInterfaces(effects)
    assert.deepEqual([...interfaces.keys()].sort(), ['rest-api', 'smtp', 'ui'])
    assert.deepEqual(
      [...bindings.values()].map((binding) => binding.internalPort).sort(),
      [2500, 9000],
    )
    for (const [id, value] of interfaces)
      assert.deepEqual(value, originalInterfaces.get(id))

    await storeJson.merge(effects, { client: { enabled: true } })
    await setInterfaces(effects)
    assert.deepEqual(interfaces, originalInterfaces)
    assert.deepEqual(bindings, originalBindings)
  })

  it('omits the Lua hook only while running without the authenticated client', () => {
    const ports = { smtp: 2500, web: 9000, pop3: 1100 }
    const enabled = inbucketEnvironment(storeShape.parse(existingConfig), ports)
    const disabled = inbucketEnvironment(
      storeShape.parse({ ...existingConfig, client: { enabled: false } }),
      ports,
    )
    const { INBUCKET_LUA_PATH, ...upstreamEnvironment } = enabled
    assert.equal(INBUCKET_LUA_PATH, '/config/inbucket.lua')
    assert.deepEqual(disabled, upstreamEnvironment)
  })

  it('accepts upstream-only startup without client credentials but requires them when enabled', async (t) => {
    const { effects } = startOsState(t)
    await storeJson.write(
      effects,
      storeShape.parse({
        domain: 'mail.example.com',
        client: { enabled: false },
      }),
    )
    await assert.doesNotReject(main({ effects }))

    await storeJson.merge(effects, { client: { enabled: true } })
    await assert.rejects(
      main({ effects }),
      /Inbucket client secrets have not been initialized/,
    )
  })

  it('requires a recipient domain in both client modes', async (t) => {
    const { effects } = startOsState(t)
    for (const enabled of [false, true]) {
      await storeJson.write(
        effects,
        storeShape.parse({
          ...existingConfig,
          domain: '',
          client: { enabled },
        }),
      )
      await assert.rejects(
        main({ effects }),
        /Disposable mail domain is not configured/,
      )
    }
  })
})
