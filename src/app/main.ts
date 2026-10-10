import './tokens.css';
import './fonts.css';
import App from './App.svelte';
import { mount } from 'svelte';
import { configureAssetRetries } from '../presentation/babylon/assetRetry';
configureAssetRetries();
const app = mount(App, { target: document.getElementById('app')! });
export default app;
