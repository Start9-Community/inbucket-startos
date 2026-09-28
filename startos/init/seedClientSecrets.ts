import { utils } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

const secret = (len: number) =>
  utils.getDefaultString({ charset: 'a-z,A-Z,0-9', len })
export const seedClientSecrets = sdk.setupOnInit(async (effects, kind) => {
  const store = await storeJson.read((value) => value).once()
  const luaEventToken = store?.luaEventToken || secret(48)

  if (kind === 'install') {
    await storeJson.merge(effects, {
      databasePassword: secret(48),
      secretKeyBase: secret(128),
      luaEventToken,
    })
  } else if (!store?.luaEventToken) {
    await storeJson.merge(effects, { luaEventToken })
  }
})
