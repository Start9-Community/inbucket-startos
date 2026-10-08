import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '3.1.1:8',
  releaseNotes: {
    en_US:
      'Update to start-sdk 3.0.3. Requires StartOS 0.4.0.2 or later. Clarify the Message Retention options and that Messages per Mailbox applies regardless of retention period.',
    es_ES:
      'Actualiza a start-sdk 3.0.3. Requiere StartOS 0.4.0.2 o posterior. Aclara las opciones de Retención de mensajes y que Mensajes por buzón se aplica independientemente del periodo de retención.',
    de_DE:
      'Aktualisiert auf start-sdk 3.0.3. Erfordert StartOS 0.4.0.2 oder neuer. Erläutert die Optionen zur Nachrichtenaufbewahrung und dass Nachrichten pro Postfach unabhängig von der Aufbewahrungsdauer gilt.',
    pl_PL:
      'Aktualizuje start-sdk do wersji 3.0.3. Wymaga StartOS 0.4.0.2 lub nowszego. Wyjaśnia opcje czasu przechowywania wiadomości oraz że limit wiadomości na skrzynkę obowiązuje niezależnie od czasu przechowywania.',
    fr_FR:
      'Met à jour vers start-sdk 3.0.3. Nécessite StartOS 0.4.0.2 ou une version ultérieure. Clarifie les options de durée de conservation des messages et précise que Messages par boîte s’applique quelle que soit la durée de conservation.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
