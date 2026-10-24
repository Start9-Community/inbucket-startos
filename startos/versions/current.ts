import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '3.2.0:0',
  releaseNotes: {
    en_US: `Updated Inbucket to 3.2.0. Stops trusting certificates from a compromised certificate authority (eMudhra).`,
    es_ES: `Inbucket actualizado a 3.2.0. Deja de confiar en los certificados de una autoridad de certificación comprometida (eMudhra).`,
    de_DE: `Inbucket auf 3.2.0 aktualisiert. Vertraut Zertifikaten einer kompromittierten Zertifizierungsstelle (eMudhra) nicht mehr.`,
    pl_PL: `Zaktualizowano Inbucket do 3.2.0. Przestaje ufać certyfikatom przejętego urzędu certyfikacji (eMudhra).`,
    fr_FR: `Inbucket mis à jour vers 3.2.0. Ne fait plus confiance aux certificats d'une autorité de certification compromise (eMudhra).`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
