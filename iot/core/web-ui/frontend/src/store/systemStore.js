import { create } from 'zustand'
import axios from 'axios'

export const useSystemStore = create((set, get) => ({
  // State
  status: null,
  info: null,
  loading: false,
  error: null,

  // Actions
  fetchStatus: async () => {
    set({ loading: true, error: null })
    try {
      const response = await axios.get('/api/system/status')
      set({ status: response.data, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
      console.error('Failed to fetch system status:', error)
    }
  },

  fetchInfo: async () => {
    set({ loading: true, error: null })
    try {
      const response = await axios.get('/api/system/info')
      set({ info: response.data, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
      console.error('Failed to fetch system info:', error)
    }
  },

  // Computed values (getters)
  getCpuUsagePercent: () => get().status?.cpu_usage || 0,
  getMemoryUsagePercent: () => get().status?.memory_percent || 0,
  getDiskUsagePercent: () => get().status?.disk_percent || 0,
  getUptimeFormatted: () => {
    const uptimeSeconds = get().status?.uptime_seconds
    if (!uptimeSeconds) return '0日'
    const days = Math.floor(uptimeSeconds / 86400)
    const hours = Math.floor((uptimeSeconds % 86400) / 3600)
    return `${days}日${hours}時間`
  }
}))
