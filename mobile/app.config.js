const base = require('./app.json')

// Dynamic config — extends app.json with values that need env vars at build time.
// EAS injects GOOGLE_MAPS_API_KEY from the project secret; locally it comes from .env.
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? ''

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    android: {
      ...base.expo.android,
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    plugins: [
      ...base.expo.plugins,
      [
        'react-native-maps',
        {
          androidApiKey: googleMapsApiKey,
        },
      ],
    ],
  },
}
