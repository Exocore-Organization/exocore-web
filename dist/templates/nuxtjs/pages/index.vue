<template>
  <main>
    <h1>⚡ Exocore Nuxt</h1>
    <p>Edit <code>pages/index.vue</code> to get started</p>
    <button @click="count++">count is {{ count }}</button>
  </main>
</template>

<script setup lang="ts">
const count = ref(0)
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0f0f0f; color: #fff; font-family: sans-serif; }
main { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 1rem; }
h1 { font-size: 2.5rem; }
p { opacity: 0.6; }
button { padding: 0.75rem 2rem; font-size: 1rem; border-radius: 8px; border: none; background: #00dc82; color: #000; cursor: pointer; font-weight: 700; }
</style>
