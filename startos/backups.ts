import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { databaseName, databaseUser } from './utils'

const databaseDump = `/media/startos/backup/${databaseName}-db.dump`
const databaseFormat = '/media/startos/backup/client-database-format'

const exists = async (path: string) => {
  try {
    await access(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

const databaseBackup = () =>
  sdk.Backups.withPgDump({
    imageId: 'postgres',
    dbVolume: 'client-postgres',
    mountpoint: '/var/lib/postgresql/data',
    pgdataPath: '',
    database: databaseName,
    user: databaseUser,
    password: async () => {
      const password = await storeJson
        .read((value) => value.databasePassword)
        .once()
      if (!password) throw new Error('Database password is not initialized')
      return password
    },
  })
    .addVolume('main')
    .setPostBackup(async () => {
      await writeFile(databaseFormat, 'pg-dump')
    })

const volumeBackup = () =>
  sdk.Backups.ofVolumes('main', 'client-postgres')
    .setPreBackup(async () => {
      await rm(databaseDump, { force: true })
    })
    .setPostBackup(async () => {
      await writeFile(databaseFormat, 'volume')
    })

export const { createBackup } = sdk.setupBackups(async () =>
  (await exists('/media/startos/volumes/client-postgres/PG_VERSION'))
    ? databaseBackup()
    : volumeBackup(),
)

export const { restoreInit } = sdk.setupBackups(async () => {
  const format = await readFile(databaseFormat, 'utf8').catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  })
  if (format === 'volume') return volumeBackup()
  if (format !== null && format !== 'pg-dump') {
    throw new Error('Unknown client database backup format')
  }
  const hasDump = await exists(databaseDump)
  if (format === 'pg-dump' && !hasDump) {
    throw new Error('Database dump is missing from this backup')
  }
  return hasDump ? databaseBackup() : volumeBackup()
})
