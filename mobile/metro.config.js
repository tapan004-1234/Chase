const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Stub native-only modules on web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { filePath: require.resolve('./src/stubs/react-native-maps.web.tsx'), type: 'sourceFile' }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
