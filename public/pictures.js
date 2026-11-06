// Picture attachments for a prompt box. Uploads start at once; the page keeps only the picture ids.
const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const HINT = 'PNG, JPEG, GIF or WebP, up to 5 MB, 5 per request. You can also paste or drop a picture on the box.';

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function mountPictures(root, { max = 5, onChange = () => {}, textarea = null } = {}) {
  const pics = [];
  let pending = 0;
  const box = node('div', 'qpics');
  const btn = node('button', 'mini ghost', 'Attach image');
  btn.type = 'button';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = TYPES.join(',');
  input.multiple = true;
  input.hidden = true;
  const hint = node('div', 'meta', HINT);
  const err = node('p', 'qerr');
  err.hidden = true;
  const thumbs = node('div', 'qthumbs');
  box.append(btn, input, hint, err, thumbs);
  root.append(box);

  const api = {
    ids: () => pics.map((p) => p.imageId),
    busy: () => pending > 0,
    clear() {
      for (const p of pics) URL.revokeObjectURL(p.url);
      pics.length = 0;
      thumbs.textContent = '';
      fail('');
      changed();
    },
  };
  const changed = () => onChange(api);
  function fail(msg) { err.textContent = msg; err.hidden = !msg; }

  async function upload(file) {
    const holder = node('div', 'qthumb', 'Uploading…');
    thumbs.append(holder);
    pending++;
    changed();
    try {
      const data = await new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result).replace(/^data:[^,]*;base64,/, ''));
        rd.onerror = () => reject(new Error('Could not read that file'));
        rd.readAsDataURL(file);
      });
      const r = await fetch('/api/prompt-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, data }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.imageId) throw new Error(j.error || String(r.status));
      const pic = { imageId: j.imageId, name: file.name, url: URL.createObjectURL(file) };
      pics.push(pic);
      holder.textContent = '';
      const img = document.createElement('img');
      img.src = pic.url;
      img.alt = pic.name;
      const x = node('button', 'qx', '×');
      x.type = 'button';
      x.title = 'Remove';
      x.onclick = () => {
        const i = pics.indexOf(pic);
        if (i >= 0) pics.splice(i, 1);
        URL.revokeObjectURL(pic.url);
        holder.remove();
        fail('');
        changed();
      };
      holder.append(img, x, node('span', 'qname', pic.name));
    } catch (e) {
      holder.remove();
      fail(e.message);
    } finally {
      pending--;
      changed();
    }
  }

  function addFiles(files) {
    fail('');
    for (const f of files) {
      if (!TYPES.includes(f.type)) { fail('That is not a picture'); continue; }
      if (pics.length + pending >= max) { fail(`${max} pictures at most`); break; }
      upload(f);
    }
  }

  btn.onclick = () => input.click();
  input.onchange = () => { addFiles([...input.files]); input.value = ''; };

  if (textarea) {
    const isImg = (f) => f && f.type && f.type.startsWith('image/');
    textarea.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter(isImg);
      if (files.length) addFiles(files);
    });
    textarea.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.classList.add('drop');
      hint.textContent = 'Drop a picture here';
    });
    const endDrag = () => { box.classList.remove('drop'); hint.textContent = HINT; };
    textarea.addEventListener('dragleave', endDrag);
    textarea.addEventListener('drop', (e) => {
      e.preventDefault();
      endDrag();
      addFiles([...(e.dataTransfer?.files || [])].filter(isImg));
    });
  }
  return api;
}
