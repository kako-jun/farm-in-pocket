import { create } from 'zustand'
import axios from 'axios'

export const useModulesStore = create((set, get) => ({
  // State
  modules: [],
  loading: false,
  error: null,

  // Actions
  fetchModules: async () => {
    set({ loading: true, error: null })
    try {
      const response = await axios.get('/api/modules')
      set({ modules: response.data.modules, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
      console.error('Failed to fetch modules:', error)
    }
  },

  startModule: async (moduleName) => {
    try {
      await axios.post(`/api/modules/${moduleName}/start`)
      await get().fetchModules()
    } catch (error) {
      console.error('Failed to start module:', error)
      throw error
    }
  },

  stopModule: async (moduleName) => {
    try {
      await axios.post(`/api/modules/${moduleName}/stop`)
      await get().fetchModules()
    } catch (error) {
      console.error('Failed to stop module:', error)
      throw error
    }
  },

  restartModule: async (moduleName) => {
    try {
      await axios.post(`/api/modules/${moduleName}/restart`)
      await get().fetchModules()
    } catch (error) {
      console.error('Failed to restart module:', error)
      throw error
    }
  },

  // Computed values (getters)
  getRunningModules: () => get().modules.filter(m => m.status === 'running'),
  getStoppedModules: () => get().modules.filter(m => m.status === 'stopped'),
  getErrorModules: () => get().modules.filter(m => m.status === 'error')
}))
