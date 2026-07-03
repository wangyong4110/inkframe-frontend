<script setup lang="ts">
const props = withDefaults(defineProps<{ size?: number }>(), { size: 36 })
</script>

<template>
  <!--
    Tricolor pinwheel logo.
    Outer circle r=16, inner hole r=7, center (18,18).
    Three junction points on outer circle at 120° intervals:
      J_A at 210° → (4.1, 10)   upper-left
      J_B at 330° → (31.9, 10)  upper-right
      J_C at  90° → (18, 34)    bottom
    Inner junction points offset 60° counterclockwise (creates clockwise swirl):
      i_A at 150° → (11.9, 21.5)
      i_B at 270° → (18, 11)
      i_C at  30° → (24.1, 21.5)
    Each section: 120° clockwise outer arc → bezier to inner junction → 120° CCW inner arc → bezier back.
  -->
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="18" cy="18" r="18" fill="white"/>
    <!-- Yellow: outer arc J_A→J_B over top, inner arc i_B→i_A -->
    <path d="M 4.1 10 A 16 16 0 0 1 31.9 10 Q 25 7 18 11 A 7 7 0 0 0 11.9 21.5 Q 4 17 4.1 10 Z" fill="#F7B400"/>
    <!-- Red: outer arc J_C→J_A through left, inner arc i_A→i_C -->
    <path d="M 18 34 A 16 16 0 0 1 4.1 10 Q 4 17 11.9 21.5 A 7 7 0 0 0 24.1 21.5 Q 26 28 18 34 Z" fill="#E53030"/>
    <!-- Blue: outer arc J_B→J_C through right, inner arc i_C→i_B -->
    <path d="M 31.9 10 A 16 16 0 0 1 18 34 Q 26 28 24.1 21.5 A 7 7 0 0 0 18 11 Q 25 7 31.9 10 Z" fill="#3BAEE0"/>
    <circle cx="18" cy="18" r="7" fill="white"/>
  </svg>
</template>
