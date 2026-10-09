// Zugangsdaten für die Verbindung mit Snapchat und TikTok.
// Leer = noch nicht eingerichtet: Die App zeigt dann einen Hinweis statt der Anmeldung.
// Anleitung zum Einrichten: texte/verbinden.md

export const SOCIAL = {
  snap: {
    // Snap Kit → Developer Portal → App → OAuth2 Client ID (zum Testen die Staging-ID)
    clientId: '',
  },
  tiktok: {
    // TikTok for Developers → App → Client key (der Client secret gehört NUR auf den Server)
    clientKey: '',
    // Adresse des kleinen Servers, der den TikTok-Code gegen das Profil tauscht (server/tiktok-worker.js)
    server: '',
  },
};

// Rücksprung-Adresse nach der Anmeldung: die App selbst, ohne #-Teil.
// Genau diese Adresse muss bei Snapchat und TikTok als Redirect URI eingetragen sein.
export const REDIRECT_URI = `${location.origin}${location.pathname}`;
