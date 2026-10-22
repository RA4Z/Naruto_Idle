import { loadingScreen } from '../../src/loading-screen';
import { LOADING_ART_URLS } from '../../src/config/loading-art';
const result = document.getElementById('result')!;
const verify = document.getElementById('verify') as HTMLButtonElement;
const catalog = await fetch('/assets/loading/index.json').then(r => r.json());
result.textContent = `${catalog.images.length} imagens no catálogo; ${LOADING_ART_URLS.length} URLs no componente.`;
verify.onclick = async () => {
  verify.disabled = true;
  try {
    for (const [index, row] of catalog.images.entries()) {
      const image = new Image();
      image.src = row.url;
      await image.decode();
      if (image.naturalWidth !== row.width || image.naturalHeight !== row.height) throw new Error(`Dimensões incorretas: ${row.id}`);
      image.removeAttribute('src');
      result.textContent = `${index + 1}/${catalog.images.length} imagens decodificadas.`;
    }
    result.textContent += ' Conferência concluída; JPEG e PNG aprovados pelo navegador.';
  } catch (error) {
    result.textContent = String(error);
  } finally {
    verify.disabled = false;
  }
};
document.getElementById('preview')!.onclick = () => {
  loadingScreen.begin('Preparando sua jornada', undefined, () => loadingScreen.hide()).update('Conferindo a arte original…', .65);
};
for (const id of ['6', '19', '140', '141', '228', '1400']) {
  const row = catalog.images.find((r: { id: string }) => r.id === id);
  const figure = document.createElement('figure');
  figure.style.margin = '0';
  const image = new Image(); image.src = row.url; image.width = 260;
  image.alt = `Arte original ${id}`;
  const caption = document.createElement('figcaption'); caption.textContent = `${id} · ${row.format || 'JPEG'} · ${row.width}×${row.height}`;
  figure.append(image, caption); document.getElementById('samples')!.append(figure);
}
