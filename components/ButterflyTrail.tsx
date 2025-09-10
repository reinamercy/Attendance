// components/ButterflyTrail.tsx
import React, { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Animated, Easing, View } from 'react-native'

type Sprite = {
  id: number
  x: number
  y: number
  size: number
  angle: number
  prog: Animated.Value
  glyph: string
  dxTarget: number
  dyTarget: number
}

type Density = 'low' | 'medium' | 'high'
const PRESET: Record<Density, { throttleMs: number; minDistPx: number; maxSprites: number; durationMs: number }> = {
  low:    { throttleMs: 60, minDistPx: 22, maxSprites: 20, durationMs: 900 },
  medium: { throttleMs: 35, minDistPx: 12, maxSprites: 32, durationMs: 950 },
  high:   { throttleMs: 16, minDistPx: 8,  maxSprites: 44, durationMs: 1000 },
}

export default function ButterflyTrail({
  emoji = '🦋',
  emojis,
  density = 'low',
  rotateToDirection = true,
}: {
  emoji?: string
  emojis?: string[]
  density?: Density
  rotateToDirection?: boolean
}) {
  const [sprites, setSprites] = useState<Sprite[]>([])
  const cfg = PRESET[density]

  const idRef = useRef(0)
  const lastSpawnTs = useRef(0)
  const lastX = useRef(0)
  const lastY = useRef(0)
  const hasLast = useRef(false)

  useEffect(() => {
    if (Platform.OS !== 'web') return

    const onMove = (e: MouseEvent) => {
      const x = e.clientX
      const y = e.clientY

      // First move: just set baseline
      if (!hasLast.current) {
        hasLast.current = true
        lastX.current = x
        lastY.current = y
        return
      }

      const now = Date.now()
      const dx = x - lastX.current
      const dy = y - lastY.current
      const dist = Math.hypot(dx, dy)

      // Gate by time and distance to avoid clumping
      if (now - lastSpawnTs.current < cfg.throttleMs || dist < cfg.minDistPx) {
        // still update last to keep direction fresh
        lastX.current = x
        lastY.current = y
        return
      }

      lastSpawnTs.current = now
      lastX.current = x
      lastY.current = y

      // Unit vector along mouse movement
      const ux = dx / (dist || 1)
      const uy = dy / (dist || 1)

      // Perpendicular unit (rotate 90°)
      const px = -uy
      const py =  ux

      // Travel distance along the path & tiny cross drift
      const travel = 26 + Math.random() * 28     // 26..54 px along the motion
      const sway   = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8) // ±6..14 px

      // Final target deltas (trail goes slightly behind the cursor)
      const dxTarget = (-ux * travel) + (px * sway)
      const dyTarget = (-uy * travel) + (py * sway)

      const angleRad = Math.atan2(uy, ux)
      const angleDeg = angleRad * 180 / Math.PI

      const id = ++idRef.current
      const size = 16 + Math.random() * 10
      const glyph = (emojis && emojis.length) ? emojis[Math.floor(Math.random() * emojis.length)] : emoji
      const prog = new Animated.Value(0)

      const s: Sprite = { id, x, y, size, angle: angleDeg, prog, glyph, dxTarget, dyTarget }

      setSprites(prev => {
        const next = [...prev, s]
        return next.length > cfg.maxSprites ? next.slice(next.length - cfg.maxSprites) : next
      })

      Animated.timing(prog, {
        toValue: 1,
        duration: cfg.durationMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return
        setSprites(prev => prev.filter(p => p.id !== id))
      })
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    return () => document.removeEventListener('mousemove', onMove)
  }, [emoji, emojis, cfg.durationMs, cfg.maxSprites, cfg.minDistPx, cfg.throttleMs, rotateToDirection])

  if (Platform.OS !== 'web') return null

  return (
    <View pointerEvents="none" style={styles.layer}>
      {sprites.map(s => {
        const opacity    = s.prog.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] })
        const translateX = s.prog.interpolate({ inputRange: [0, 1], outputRange: [0, s.dxTarget] })
        const translateY = s.prog.interpolate({ inputRange: [0, 1], outputRange: [0, s.dyTarget] })
        const scale      = s.prog.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.12] })
        const tilt       = s.prog.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) // tiny flutter

        return (
          <Animated.Text
            key={s.id}
            style={[
              styles.sprite,
              {
                left: s.x - s.size / 2,
                top:  s.y - s.size / 2,
                fontSize: s.size,
                opacity,
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                  { rotate: `${(rotateToDirection ? s.angle : 0) + (typeof tilt === 'number' ? tilt : 0)}deg` },
                ],
              },
            ]}
          >
            {s.glyph}
          </Animated.Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { position: 'fixed', inset: 0, zIndex: 9999 },
  sprite: {
    position: 'absolute',
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowRadius: 2,
  },
})
