"use client"

import { SUPERMAIL } from "@/constants/app"
import { auth } from "@/firebase"
import { Stack, usePathname, useRouter } from "expo-router"
import { onAuthStateChanged } from "firebase/auth"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Text, View, Animated, Easing, Pressable, Platform } from "react-native"

// Primary: teal; Neutrals: white, near-black, gray; Black for shadow
const COLORS = {
  primary: "#14b8a6", // teal
  white: "#ffffff",
  nearBlack: "#111827",
  gray: "#6b7280",
  shadow: "#000000",
}

function FadeInUp({
  children,
  delay = 0,
  distance = 12,
  duration = 450,
}: {
  children: React.ReactNode
  delay?: number
  distance?: number
  duration?: number
}) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [anim, delay, duration])

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [distance, 0],
  })

  return <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>{children}</Animated.View>
}
function HeaderBack() {
  const router = useRouter()
  const goBack = () => {
    // works even if there's nothing to pop
    if ((router as any).canGoBack?.()) router.back()
    else router.replace("/")            // fallback route
  }
  return (
    <Pressable onPress={goBack} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
      <Text style={{ color: "#fff", fontWeight: "800" }}>‹ Back</Text>
    </Pressable>
  )
}
function Dot({ delay = 0 }: { delay?: number }) {
  const scale = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 400,
          delay,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [delay, scale])

  const animatedScale = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.1],
  })

  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.primary,
        marginHorizontal: 4,
        transform: [{ scale: animatedScale }],
      }}
    />
  )
}

function AnimatedButton({
  onPress,
  children,
  backgroundColor = COLORS.primary,
}: {
  onPress: () => void
  children: React.ReactNode
  backgroundColor?: string
}) {
  const scale = useRef(new Animated.Value(1)).current

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 30,
      bounciness: 0,
    }).start()
  }

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start()
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={({ pressed }) => [
          {
            backgroundColor,
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            // nicer elevation
            shadowColor: COLORS.shadow,
            shadowOpacity: 0.15,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: pressed ? 4 : 8,
          },
        ]}
      >
        <Text
          style={{
            color: COLORS.white,
            fontWeight: "700",
            letterSpacing: 0.3,
          }}
        >
          {children}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

export default function HODLayout() {
  const router = useRouter()
  const pathname = usePathname() // <-- know where we are
  const onLoginScreen = pathname?.endsWith("/hod/login") // <-- allow this route

  const [email, setEmail] = useState<string | null>()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    const sub = onAuthStateChanged(auth, (u) => {
      setEmail(u?.email ?? null)
      setAllowed(!!u?.email && u.email === SUPERMAIL)
    })
    return sub
  }, [])

  // If we are on /hod/login, DO NOT GUARD — just render the stack
  if (onLoginScreen) {
    return (
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: COLORS.nearBlack },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: "700" },
          animation: "fade",
        }}
      >
        <Stack.Screen name="login" options={{ title: "HOD Login" }} />
        <Stack.Screen name="index" options={{ title: "HOD" }} />
        <Stack.Screen name="classes" options={{ title: "Classes" }} />
        <Stack.Screen name="attendance" options={{ title: "Attendance" }} />
      </Stack>
    )
  }

  // Normal guarded flow for other /hod/* screens
  if (allowed === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: COLORS.white,
        }}
      >
        <FadeInUp>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </FadeInUp>

        <FadeInUp delay={100}>
          <Text
            style={{
              marginTop: 12,
              fontSize: 18,
              fontWeight: "700",
              color: COLORS.nearBlack,
            }}
          >
            Checking HOD access
          </Text>
        </FadeInUp>

        <FadeInUp delay={180}>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              marginTop: 6,
              color: COLORS.gray,
              textAlign: "center",
            }}
          >
            Hold on while we confirm your permissions…
          </Text>
        </FadeInUp>

        <FadeInUp delay={260}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <Dot delay={0} />
            <Dot delay={150} />
            <Dot delay={300} />
          </View>
        </FadeInUp>
      </View>
    )
  }

  if (allowed === false) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: COLORS.white,
        }}
      >
        <FadeInUp>
          <View
            style={{
              width: "92%",
              maxWidth: 440,
              backgroundColor: COLORS.white,
              borderRadius: 16,
              padding: 20,
              // Card shadow
              shadowColor: COLORS.shadow,
              shadowOpacity: 0.08,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
              elevation: 6,
              borderWidth: Platform.OS === "android" ? 0 : 0.5,
              borderColor: "#eee",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: COLORS.nearBlack,
                marginBottom: 8,
              }}
            >
              HOD Access Required
            </Text>

            <Text
              style={{
                color: COLORS.gray,
                lineHeight: 20,
                marginBottom: 16,
              }}
            >
              You are signed in as:{" "}
              <Text style={{ color: COLORS.nearBlack, fontWeight: "600" }}>{email ?? "(no session)"}</Text>
              {"\n"}
              Only <Text style={{ color: COLORS.primary, fontWeight: "700" }}>{SUPERMAIL}</Text> can access the HOD
              portal.
            </Text>

            <AnimatedButton onPress={() => router.replace("/hod/login")}>Go to HOD Login</AnimatedButton>

            <Text
              style={{
                marginTop: 10,
                fontSize: 12,
                color: COLORS.gray,
                textAlign: "center",
              }}
            >
              You’ll be redirected securely to sign in with the correct account.
            </Text>
          </View>
        </FadeInUp>
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    >
      <Stack.Screen name="index" options={{ title: "HOD" }} />
      <Stack.Screen name="classes" options={{ title: "Classes" }} />
      <Stack.Screen name="attendance" options={{ title: "Attendance" }} />
    </Stack>
    
  )
}
