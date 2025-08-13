import { Stack } from 'expo-router'
import React from 'react'

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="admin/login" />
      <Stack.Screen name="admin/register" />
      <Stack.Screen name="admin/dashboard" />
      <Stack.Screen name="admin/attendance" />
      
    </Stack>
  )
}
