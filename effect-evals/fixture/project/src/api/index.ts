export async function uploadFile(uri: string): Promise<string> {
  const res = await fetch('/files', { method: 'POST', body: uri })
  return (await res.json()).fileId
}

export async function getBonusItems(): Promise<any[]> {
  const res = await fetch('/bonus-items')
  return res.json()
}
