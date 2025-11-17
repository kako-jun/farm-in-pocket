<template>
  <div class="space-y-6">
    <h2 class="text-3xl font-bold text-gray-800 flex items-center">
      <span class="text-4xl mr-3">🌾</span>
      Farm in Pocket Dashboard
    </h2>

    <!-- システム情報 -->
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-xl font-semibold mb-4 text-gray-700">システム情報</h3>
      <div v-if="systemStore.loading" class="text-center py-4">
        <p class="text-gray-500">読み込み中...</p>
      </div>
      <div v-else-if="systemStore.error" class="text-center py-4">
        <p class="text-red-500">エラー: {{ systemStore.error }}</p>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-blue-50 rounded-lg p-4">
          <p class="text-sm text-gray-600">CPU使用率</p>
          <p class="text-3xl font-bold text-blue-600">{{ systemStore.cpuUsagePercent.toFixed(1) }}%</p>
        </div>
        <div class="bg-green-50 rounded-lg p-4">
          <p class="text-sm text-gray-600">メモリ</p>
          <p class="text-3xl font-bold text-green-600">{{ formatBytes(systemStore.status?.memory_used) }} / {{ formatBytes(systemStore.status?.memory_total) }}</p>
          <p class="text-sm text-gray-500">{{ systemStore.memoryUsagePercent.toFixed(1) }}%</p>
        </div>
        <div class="bg-purple-50 rounded-lg p-4">
          <p class="text-sm text-gray-600">稼働時間</p>
          <p class="text-3xl font-bold text-purple-600">{{ systemStore.uptimeFormatted }}</p>
        </div>
      </div>
    </div>

    <!-- 導入済みモジュール -->
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-xl font-semibold mb-4 text-gray-700">導入済みモジュール</h3>
      <div v-if="modulesStore.loading" class="text-center py-4">
        <p class="text-gray-500">読み込み中...</p>
      </div>
      <div v-else-if="modulesStore.error" class="text-center py-4">
        <p class="text-red-500">エラー: {{ modulesStore.error }}</p>
      </div>
      <div v-else class="space-y-4">
        <div
          v-for="module in modulesStore.modules"
          :key="module.name"
          class="border rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <span class="text-2xl">{{ getStatusIcon(module.status) }}</span>
                <div>
                  <h4 class="font-semibold text-lg">{{ module.name }}</h4>
                  <p class="text-sm text-gray-500">{{ module.description }}</p>
                </div>
              </div>
              <div class="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                <span>バージョン: {{ module.version }}</span>
                <span :class="getStatusClass(module.status)">{{ getStatusText(module.status) }}</span>
              </div>
              <div v-if="module.metrics" class="mt-2 text-sm">
                <span v-for="(value, key) in module.metrics" :key="key" class="mr-4">
                  {{ key }}: <strong>{{ value }}</strong>
                </span>
              </div>
            </div>
            <div class="flex space-x-2">
              <button
                v-if="module.status !== 'running'"
                @click="startModule(module.name)"
                class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
              >
                起動
              </button>
              <button
                v-if="module.status === 'running'"
                @click="stopModule(module.name)"
                class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
              >
                停止
              </button>
              <button
                @click="restartModule(module.name)"
                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                再起動
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useSystemStore } from '@/stores/system'
import { useModulesStore } from '@/stores/modules'

const systemStore = useSystemStore()
const modulesStore = useModulesStore()

onMounted(() => {
  systemStore.fetchStatus()
  modulesStore.fetchModules()

  // 30秒ごとに更新
  setInterval(() => {
    systemStore.fetchStatus()
    modulesStore.fetchModules()
  }, 30000)
})

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}

const getStatusIcon = (status) => {
  const icons = {
    running: '✅',
    stopped: '⚫',
    error: '❌',
    warning: '⚠️'
  }
  return icons[status] || '❓'
}

const getStatusText = (status) => {
  const texts = {
    running: '稼働中',
    stopped: '停止中',
    error: 'エラー',
    warning: '警告'
  }
  return texts[status] || '不明'
}

const getStatusClass = (status) => {
  const classes = {
    running: 'text-green-600 font-semibold',
    stopped: 'text-gray-600',
    error: 'text-red-600 font-semibold',
    warning: 'text-yellow-600 font-semibold'
  }
  return classes[status] || 'text-gray-600'
}

const startModule = async (moduleName) => {
  try {
    await modulesStore.startModule(moduleName)
  } catch (error) {
    alert(`モジュールの起動に失敗しました: ${error.message}`)
  }
}

const stopModule = async (moduleName) => {
  try {
    await modulesStore.stopModule(moduleName)
  } catch (error) {
    alert(`モジュールの停止に失敗しました: ${error.message}`)
  }
}

const restartModule = async (moduleName) => {
  try {
    await modulesStore.restartModule(moduleName)
  } catch (error) {
    alert(`モジュールの再起動に失敗しました: ${error.message}`)
  }
}
</script>
