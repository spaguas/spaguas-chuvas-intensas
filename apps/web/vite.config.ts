import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()], base:'/chuvas_intensas/', server:{proxy:{'/chuvas_intensas/api':'http://127.0.0.1:3108','/chuvas_intensas/docs':'http://127.0.0.1:3108','/chuvas_intensas/source':{target:'http://127.0.0.1:3108'}}}});
