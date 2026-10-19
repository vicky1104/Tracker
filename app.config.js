// Dynamic additions on top of app.json (https://docs.expo.dev/workflow/configuration/).
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // Android push (Firebase Cloud Messaging) needs the Firebase client config.
  // Download it from Firebase console → Project settings → Your apps → Android.
  const googleServicesFile = path.join(__dirname, 'google-services.json');
  const easProjectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;

  return {
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(googleServicesFile) ? { googleServicesFile: './google-services.json' } : {}),
    },
    extra: {
      ...config.extra,
      ...(easProjectId ? { eas: { ...config.extra?.eas, projectId: easProjectId } } : {}),
    },
  };
};
