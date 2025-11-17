<template>
  <div id="app" class="min-h-screen">
    <nav class="bg-farm-green-600 text-white shadow-lg">
      <div class="container mx-auto px-4 py-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-2xl">🌾</span>
            <h1 class="text-xl font-bold">Farm in Pocket</h1>
          </div>
          <div class="flex space-x-4">
            <router-link to="/" class="hover:text-farm-green-200">ダッシュボード</router-link>
            <router-link to="/modules" class="hover:text-farm-green-200">モジュール</router-link>
            <router-link to="/logs" class="hover:text-farm-green-200">ログ</router-link>
            <router-link to="/settings" class="hover:text-farm-green-200">設定</router-link>
          </div>
        </div>
      </div>
    </nav>

    <main class="container mx-auto px-4 py-6">
      <router-view />
    </main>

    <footer class="bg-gray-800 text-white text-center py-4 mt-12">
      <p>Farm in Pocket - 農業の未来をポケットに</p>
      <p class="text-sm text-gray-400 mt-1">v0.1.0</p>
    </footer>
  </div>
</template>

<script setup>
</script>

<style scoped>
.router-link-active {
  @apply text-farm-green-200 font-semibold;
}
</style>
