import ImageResizer from 'react-native-image-resizer'

export async function resizeImage(uri: string): Promise<string> {
  const out = await ImageResizer.createResizedImage(uri, 1280, 1280, 'JPEG', 70)
  return out.uri
}
