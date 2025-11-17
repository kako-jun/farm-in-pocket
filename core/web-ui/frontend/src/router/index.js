import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import ModuleManage from '../views/ModuleManage.vue'
import Logs from '../views/Logs.vue'
import Settings from '../views/Settings.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: Dashboard
    },
    {
      path: '/modules',
      name: 'modules',
      component: ModuleManage
    },
    {
      path: '/logs',
      name: 'logs',
      component: Logs
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings
    }
  ]
})

export default router
