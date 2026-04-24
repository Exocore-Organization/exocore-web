<script lang="ts">
  let count = 0
</script>

<main>
  <h1>⚡ Exocore SvelteKit</h1>
  <p>Edit <code>src/routes/+page.svelte</code> to get started</p>
  <button on:click={() => count++}>count is {count}</button>
</main>

<style>
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(body) { background: #0f0f0f; color: #fff; font-family: sans-serif; }
  main { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 1rem; }
  h1 { font-size: 2.5rem; }
  p { opacity: 0.6; }
  button { padding: 0.75rem 2rem; font-size: 1rem; border-radius: 8px; border: none; background: #ff3e00; color: #fff; cursor: pointer; font-weight: 700; }
</style>
