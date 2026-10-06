import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '3.1.1:8',
  releaseNotes: {
    en_US: `Add configurable message rules with previews and combinable actions for notifications, stars, read state, tags, and Trash, plus reusable Email, ntfy, and Webhook destinations. Make the authenticated client optional and enabled by default; disabling it runs only Inbucket while preserving client data for re-enabling.

- Message Retention's description explains each of its options.`,
    es_ES: `Agrega reglas configurables de mensajes con vistas previas y acciones combinables para notificaciones, destacados, estado de lectura, etiquetas y Papelera, además de destinos reutilizables de Email, ntfy y Webhook. El cliente autenticado es opcional y está activado por defecto; al desactivarlo solo se ejecuta Inbucket y se conservan los datos del cliente para volver a activarlo.

- La descripción de Retención de mensajes explica cada una de sus opciones.`,
    de_DE: `Fügt konfigurierbare Nachrichtenregeln mit Vorschau und kombinierbaren Aktionen für Benachrichtigungen, Markierungen, Lesestatus, Tags und Papierkorb sowie wiederverwendbaren Email-, ntfy- und Webhook-Zielen hinzu. Der authentifizierte Client ist optional und standardmäßig aktiviert. Bei Deaktivierung läuft nur Inbucket; die Client-Daten bleiben für eine spätere Aktivierung erhalten.

- Die Beschreibung von Nachrichtenaufbewahrung erklärt jede ihrer Optionen.`,
    pl_PL: `Dodaje konfigurowalne reguły wiadomości z podglądem i łączonymi akcjami dla powiadomień, oznaczania gwiazdką, stanu przeczytania, tagów i Kosza oraz miejscami docelowymi Email, ntfy i Webhook. Uwierzytelniony klient jest opcjonalny i domyślnie włączony. Po jego wyłączeniu działa tylko Inbucket, a dane klienta są zachowane do ponownego włączenia.

- Opis ustawienia Czas przechowywania wiadomości wyjaśnia każdą z jego opcji.`,
    fr_FR: `Ajoute des règles de messages configurables avec aperçu et actions combinables pour les notifications, favoris, état de lecture, étiquettes et Corbeille, ainsi que des destinations Email, ntfy et Webhook réutilisables. Le client authentifié est facultatif et activé par défaut. Sa désactivation laisse uniquement Inbucket en fonctionnement et conserve les données du client pour sa réactivation.

- La description de Durée de conservation des messages explique chacune de ses options.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
