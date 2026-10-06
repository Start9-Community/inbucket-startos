import { sdk } from '../sdk'
import { dependencies } from '../dependencies'
import { setInterfaces } from '../interfaces'
import { versionGraph } from '../versions'
import { actions } from '../actions'
import { restoreInit } from '../backups'
import { requireDomain } from './requireDomain'
import { seedClientSecrets } from './seedClientSecrets'
import { watchCredentials } from './watchCredentials'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  seedClientSecrets,
  setInterfaces,
  actions,
  dependencies,
  requireDomain,
  watchCredentials,
)

export const uninit = sdk.setupUninit(versionGraph)
