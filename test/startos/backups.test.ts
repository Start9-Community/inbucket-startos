import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import { createBackup, restoreInit } from '../../startos/backups'

const disk = {
  access: fs.access,
  cp: fs.cp,
  mkdir: fs.mkdir,
  mkdtemp: fs.mkdtemp,
  readFile: fs.readFile,
  readdir: fs.readdir,
  rm: fs.rm,
  writeFile: fs.writeFile,
}

const dumpName = 'inbucket_client_production-db.dump'
const formatName = 'client-database-format'

async function backupFilesystem(context: TestContext) {
  const directory = await disk.mkdtemp(join(tmpdir(), 'inbucket-backups-test-'))
  context.after(() => disk.rm(directory, { recursive: true, force: true }))
  const path = (value: string) =>
    value.startsWith('/media/startos/')
      ? join(directory, value.slice('/media/startos/'.length))
      : value

  context.mock.method(fs, 'access', (value: string, mode?: number) =>
    disk.access(path(value), mode),
  )
  context.mock.method(
    fs,
    'mkdir',
    (value: string, options?: Parameters<typeof fs.mkdir>[1]) =>
      disk.mkdir(path(value), options),
  )
  context.mock.method(
    fs,
    'rm',
    (value: string, options?: Parameters<typeof fs.rm>[1]) =>
      disk.rm(path(value), options),
  )
  context.mock.method(
    fs,
    'readFile',
    (value: string, options?: Parameters<typeof fs.readFile>[1]) =>
      disk.readFile(path(value), options),
  )
  context.mock.method(
    fs,
    'writeFile',
    (
      value: string,
      data: Parameters<typeof fs.writeFile>[1],
      options?: Parameters<typeof fs.writeFile>[2],
    ) => disk.writeFile(path(value), data, options),
  )
  context.mock.method(
    childProcess,
    'spawn',
    (command: string, args: string[]) => {
      if (command !== 'rsync') {
        throw new Error(
          `External command is unavailable in this test: ${command}`,
        )
      }
      const process = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        pid: 1,
      })
      queueMicrotask(async () => {
        try {
          const source = path(args[args.length - 2])
          const destination = path(args[args.length - 1])
          await disk.access(source)
          if (args.includes('--delete')) {
            await disk.rm(destination, { recursive: true, force: true })
          }
          await disk.cp(source, destination, { recursive: true })
          process.emit('exit', 0)
        } catch (error) {
          process.stderr.emit('data', String(error))
          process.emit('exit', 1)
        }
      })
      return process
    },
  )

  await disk.mkdir(join(directory, 'volumes/main/storage/mailbox'), {
    recursive: true,
  })
  await disk.mkdir(join(directory, 'volumes/client-postgres'), {
    recursive: true,
  })
  await disk.mkdir(join(directory, 'backup'))

  let restoredVersion: string | undefined
  const effects = {
    getDataVersion: async () => '3.1.1:7',
    setDataVersion: async ({ version }: { version: string }) => {
      restoredVersion = version
    },
    setBackupProgress: async () => {},
    setInitProgress: async () => {},
  } as unknown as Parameters<typeof createBackup>[0]['effects']

  return {
    directory,
    effects,
    restoredVersion: () => restoredVersion,
  }
}

describe('backups with an optional authenticated client', () => {
  it('preserves and restores mail and disabled client settings before its database exists', async (context) => {
    const fixture = await backupFilesystem(context)
    const { directory, effects } = fixture
    const store = JSON.stringify({
      domain: 'mail.example.com',
      client: { enabled: false },
      databasePassword: 'saved-database-secret',
      secretKeyBase: 'saved-client-secret',
    })
    const message = 'Subject: Saved mail\n\nKeep this message.'
    await disk.writeFile(join(directory, 'volumes/main/store.json'), store)
    await disk.writeFile(
      join(directory, 'volumes/main/storage/mailbox/message'),
      message,
    )

    await createBackup({ effects })

    assert.equal(
      await disk.readFile(join(directory, 'backup', formatName), 'utf8'),
      'volume',
    )
    assert.equal(
      await disk.readFile(
        join(directory, 'backup/volumes/main/store.json'),
        'utf8',
      ),
      store,
    )
    assert.equal(
      await disk.readFile(
        join(directory, 'backup/volumes/main/storage/mailbox/message'),
        'utf8',
      ),
      message,
    )
    assert.deepEqual(
      await disk.readdir(join(directory, 'backup/volumes/client-postgres')),
      [],
    )
    await disk.writeFile(join(directory, 'volumes/main/store.json'), '{}')
    await disk.writeFile(
      join(directory, 'volumes/main/storage/mailbox/message'),
      'Changed after backup',
    )
    await disk.writeFile(
      join(directory, 'volumes/main/unbacked-file'),
      'remove',
    )

    await restoreInit.init(effects, 'restore')

    assert.equal(
      await disk.readFile(join(directory, 'volumes/main/store.json'), 'utf8'),
      store,
    )
    assert.equal(
      await disk.readFile(
        join(directory, 'volumes/main/storage/mailbox/message'),
        'utf8',
      ),
      message,
    )
    assert.deepEqual(
      await disk.readdir(join(directory, 'volumes/client-postgres')),
      [],
    )
    await assert.rejects(
      disk.access(join(directory, 'volumes/main/unbacked-file')),
      {
        code: 'ENOENT',
      },
    )
    assert.equal(fixture.restoredVersion(), '3.1.1:7')
  })

  it('replaces a stale database dump with a restorable volume backup and preserves partial database files', async (context) => {
    const { directory, effects } = await backupFilesystem(context)
    await disk.writeFile(join(directory, 'backup', dumpName), 'stale dump')
    await disk.writeFile(
      join(directory, 'volumes/client-postgres/partial-data'),
      'retained data',
    )

    await createBackup({ effects })

    await assert.rejects(disk.access(join(directory, 'backup', dumpName)), {
      code: 'ENOENT',
    })
    assert.equal(
      await disk.readFile(
        join(directory, 'backup/volumes/client-postgres/partial-data'),
        'utf8',
      ),
      'retained data',
    )
    await disk.rm(join(directory, 'volumes/client-postgres/partial-data'))

    await restoreInit.init(effects, 'restore')

    assert.equal(
      await disk.readFile(
        join(directory, 'volumes/client-postgres/partial-data'),
        'utf8',
      ),
      'retained data',
    )
  })

  it('reports inaccessible database state instead of silently creating a volume backup', async (context) => {
    const { directory, effects } = await backupFilesystem(context)
    await disk.writeFile(join(directory, 'backup', dumpName), 'existing backup')
    const failure = Object.assign(new Error('Database volume is unreadable'), {
      code: 'EACCES',
    })
    context.mock.method(fs, 'access', async () => {
      throw failure
    })

    await assert.rejects(createBackup({ effects }), failure)

    assert.equal(
      await disk.readFile(join(directory, 'backup', dumpName), 'utf8'),
      'existing backup',
    )
  })

  it('rejects a missing logical dump without restoring stale raw files', async (context) => {
    const { directory, effects } = await backupFilesystem(context)
    await disk.writeFile(
      join(directory, 'volumes/main/store.json'),
      '{"client":{"enabled":false}}',
    )
    await disk.writeFile(
      join(directory, 'volumes/client-postgres/partial-data'),
      'old raw snapshot',
    )
    await createBackup({ effects })
    await disk.writeFile(join(directory, 'backup', formatName), 'pg-dump')
    await disk.writeFile(
      join(directory, 'volumes/main/store.json'),
      '{"client":{"enabled":true}}',
    )
    await disk.writeFile(
      join(directory, 'volumes/client-postgres/partial-data'),
      'current database data',
    )

    await assert.rejects(
      restoreInit.init(effects, 'restore'),
      /Database dump is missing from this backup/,
    )

    assert.equal(
      await disk.readFile(join(directory, 'volumes/main/store.json'), 'utf8'),
      '{"client":{"enabled":true}}',
    )
    assert.equal(
      await disk.readFile(
        join(directory, 'volumes/client-postgres/partial-data'),
        'utf8',
      ),
      'current database data',
    )
  })

  it('restores a legacy volume backup without a format marker', async (context) => {
    const { directory, effects } = await backupFilesystem(context)
    await disk.writeFile(
      join(directory, 'volumes/main/storage/mailbox/message'),
      'Mail saved before format markers',
    )
    await createBackup({ effects })
    await disk.rm(join(directory, 'backup', formatName))
    await disk.rm(join(directory, 'volumes/main/storage/mailbox/message'))

    await restoreInit.init(effects, 'restore')

    assert.equal(
      await disk.readFile(
        join(directory, 'volumes/main/storage/mailbox/message'),
        'utf8',
      ),
      'Mail saved before format markers',
    )
    assert.deepEqual(
      await disk.readdir(join(directory, 'volumes/client-postgres')),
      [],
    )
  })

  it('rejects an unknown backup format without replacing current files', async (context) => {
    const { directory, effects } = await backupFilesystem(context)
    await disk.writeFile(join(directory, 'backup', formatName), 'unknown')
    await disk.writeFile(
      join(directory, 'volumes/main/storage/mailbox/message'),
      'Current mail',
    )

    await assert.rejects(
      restoreInit.init(effects, 'restore'),
      /Unknown client database backup format/,
    )

    assert.equal(
      await disk.readFile(
        join(directory, 'volumes/main/storage/mailbox/message'),
        'utf8',
      ),
      'Current mail',
    )
  })

  it('reports inaccessible backup state instead of silently selecting another restore format', async (context) => {
    const { effects } = await backupFilesystem(context)
    const failure = Object.assign(new Error('Backup storage is unreadable'), {
      code: 'EIO',
    })
    context.mock.method(fs, 'access', async () => {
      throw failure
    })

    await assert.rejects(restoreInit.init(effects, 'restore'), failure)
  })
})
