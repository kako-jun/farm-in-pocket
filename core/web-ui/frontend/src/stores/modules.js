import { defineStore } from 'pinia'
import axios from 'axios'

export const useModulesStore = defineStore('modules', {
  state: () => ({
    modules: [],
    loading: false,
    error: null
  }),

  actions: {
    async fetchModules() {
      this.loading = true
      this.error = null
      try {
        const response = await axios.get('/api/modules')
        this.modules = response.data.modules
      } catch (error) {
        this.error = error.message
        console.error('Failed to fetch modules:', error)
      } finally {
        this.loading = false
      }
    },

    async startModule(moduleName) {
      try {
        await axios.post(`/api/modules/${moduleName}/start`)
        await this.fetchModules()
      } catch (error) {
        console.error('Failed to start module:', error)
        throw error
      }
    },

    async stopModule(moduleName) {
      try {
        await axios.post(`/api/modules/${moduleName}/stop`)
        await this.fetchModules()
      } catch (error) {
        console.error('Failed to stop module:', error)
        throw error
      }
    },

    async restartModule(moduleName) {
      try {
        await axios.post(`/api/modules/${moduleName}/restart`)
        await this.fetchModules()
      } catch (error) {
        console.error('Failed to restart module:', error)
        throw error
      }
    }
  },

  getters: {
    runningModules: (state) => state.modules.filter(m => m.status === 'running'),
    stoppedModules: (state) => state.modules.filter(m => m.status === 'stopped'),
    errorModules: (state) => state.modules.filter(m => m.status === 'error')
  }
})
