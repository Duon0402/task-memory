import React from 'react'
import { FlatList } from 'react-native'

type Props<T> = { data: T[]; renderItem: (item: T) => React.ReactElement }

// Shared by every list screen in the app.
export function BaseList<T>({ data, renderItem }: Props<T>) {
  return <FlatList data={data} renderItem={({ item }) => renderItem(item)} />
}
