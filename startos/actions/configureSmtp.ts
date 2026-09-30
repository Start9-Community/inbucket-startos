import { smtpPrefill } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const inputSpec = sdk.InputSpec.of({
  smtp: sdk.inputSpecConstants.smtpInputSpec,
})

export const configureSmtp = sdk.Action.withInput(
  'configure-smtp',
  async ({ effects }) => ({
    name: i18n('Configure SMTP'),
    description: i18n('Configure outbound notification email delivery.'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility:
      (await storeJson.read((store) => store.client.enabled).const(effects)) ===
      false
        ? 'hidden'
        : 'enabled',
  }),
  inputSpec,
  async ({ effects }) => ({
    smtp: smtpPrefill(
      await storeJson.read((store) => store.smtp).const(effects),
    ),
  }),
  async ({ effects, input }) => {
    const enabled = await storeJson.read((store) => store.client.enabled).once()
    if (enabled === false) {
      throw new Error(
        'Enable the authenticated client before configuring notification SMTP.',
      )
    }
    await storeJson.merge(effects, { smtp: input.smtp })
  },
)
