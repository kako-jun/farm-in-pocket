import { defineStore } from 'pinia'
import axios from 'axios'

export const useSystemStore = defineStore('system', {
  state: () => ({
    status: null,
    info: null,
    loading: false,
    error: null
  }),

  actions: {
    async fetchStatus() {
      this.loading = true
      this.error = null
      try {
        const response = await axios.get('/api/system/status')
        this.status = response.data
      } catch (error) {
        this.error = error.message
        console.error('Failed to fetch system status:', error)
      } finally {
        this.loading = false
      }
    },

    async fetchInfo() {
      this.loading = true
      this.error = null
      try {
        const response = await axios.get('/api/system/info')
        this.info = response.data
      } catch (error) {
        this.error = error.message
        console.error('Failed to fetch system info:', error)
      } finally {
        this.loading = false
      }
    }
  },

  getters: {
    cpuUsagePercent: (state) => state.status?.cpu_usage || 0,
    memoryUsagePercent: (state) => state.status?.memory_percent || 0,
    diskUsagePercent: (state) => state.status?.disk_percent || 0,
    uptimeFormatted: (state) => {
      if (!state.status?.uptime_seconds) return '0日'
      const days = Math.floor(state.status.uptime_seconds / 86400)
      const hours = Math.floor((state.status.uptime_seconds % 86400) / 3600)
      return `${days}日${hours}時間`
    }
  }
})
