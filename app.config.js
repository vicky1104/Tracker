// Dynamic additions on top of app.json (https://docs.expo.dev/workflow/configuration/).
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // Android push (Firebase Cloud Messaging) needs the Firebase client config.
  // Download it from Firebase console → Project settings → Your apps → Android.
  const googleServicesFile = path.join(__dirname, 'google-services.json');
  // iOS push (FCM) + Google Sign-In native flow need the iOS Firebase client config.
  // Download it from Firebase console → Project settings → Your apps → iOS.
  const googleServicesFileiOS = path.join(__dirname, 'GoogleService-Info.plist');
  const easProjectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;

  return {
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(googleServicesFile) ? { googleServicesFile: './google-services.json' } : {}),
    },
    ios: {
      ...config.ios,
      ...(fs.existsSync(googleServicesFileiOS) ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
    },
    extra: {
      ...config.extra,
      ...(easProjectId ? { eas: { ...config.extra?.eas, projectId: easProjectId } } : {}),
    },
  };
};
