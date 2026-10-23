import { renderEquipmentMenu } from '../../src/progression/equipment-menu';
import { fresh } from '../../src/model';
import { runtimeIndex } from '../../src/assets/runtime-index';
import { setLocale } from '../../src/i18n/core';
setLocale('pt-BR');
const save = fresh('naruto');
save.coins = 7816;
const { entities } = await runtimeIndex();
const host = document.getElementById('app')!;
const state = { character: '11000101', shop: false };
function render() { host.replaceChildren(); renderEquipmentMenu(host, { save, heroId: '11000101', entries: entities, state, allowed: () => true, changed: () => {}, rerender: render, feedback: console.info, switchCharacter: async () => {} }); }
render();
(document.getElementById('panel') as HTMLDialogElement).showModal();
document.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => (document.getElementById('panel') as HTMLDialogElement).close();
