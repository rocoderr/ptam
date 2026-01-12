const panelList = document.getElementById("ideology-list");
const panelDetail = document.getElementById("ideology-detail");
const canvas = document.getElementById("axis-canvas");
const notice = document.getElementById("axis-notice");
const btnAll = document.getElementById("btn-all");
const btnNone = document.getElementById("btn-none");
const btnReset = document.getElementById("btn-reset");
const base = document.body?.dataset?.base || "";
const GROUP_ORDER = ["classic", "contemporary"];
const GROUP_LABELS = {
  classic: "经典意识形态",
  contemporary: "当代意识形态",
};

function setDetail(text) {
  panelDetail.textContent = text;
}

function setNotice(text) {
  if (!notice) return;
  if (!text) {
    notice.hidden = true;
    notice.textContent = "";
    return;
  }
  notice.textContent = text;
  notice.hidden = false;
}

async function loadIdeologies() {
  const response = await fetch(`${base}assets/ideologies.extracted.json`, {
    cache: "no-cache",
  });
  if (!response.ok) throw new Error("Missing ideologies data.");
  return response.json();
}

function colorFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 80%, 55%)`;
}

function renderList(items, enabled, onToggle, onSelect) {
  panelList.innerHTML = "";

  const groups = new Map();
  for (const item of items) {
    const group = item.group || "classic";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }

  const orderedGroups = [
    ...GROUP_ORDER.filter((group) => groups.has(group)),
    ...[...groups.keys()].filter((group) => !GROUP_ORDER.includes(group)),
  ];

  function setItemChecked(id, checked) {
    const input = panelList.querySelector(`input[data-id="${id}"]`);
    if (input) input.checked = checked;
    onToggle(id, checked);
  }

  function renderItems(list, container) {
    for (const item of list) {
      const row = document.createElement("label");
      row.className = "axis-item";
      row.dataset.id = item.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = enabled.has(item.id);
      checkbox.dataset.id = item.id;
      const swatchColor = item.color || colorFromId(item.id);
      checkbox.style.accentColor = swatchColor;
      checkbox.addEventListener("change", () => onToggle(item.id, checkbox.checked));

      const swatch = document.createElement("div");
      swatch.className = "axis-swatch";
      swatch.style.background = swatchColor;

      const textWrap = document.createElement("div");
      const name = document.createElement("div");
      name.textContent = `${item.name.zh} (${item.name.en})`;

      textWrap.append(name);
      row.append(checkbox, swatch, textWrap);
      row.addEventListener("click", (e) => {
        if (e.target && e.target.tagName === "INPUT") return;
        onSelect(item.id);
      });
      container.append(row);
    }
  }

  for (const group of orderedGroups) {
    const list = groups.get(group) || [];
    const details = document.createElement("details");
    details.className = "axis-group";
    details.open = group !== "contemporary";

    const summary = document.createElement("summary");
    summary.className = "axis-group__summary";

    const title = document.createElement("span");
    title.className = "axis-group__title";
    title.textContent = GROUP_LABELS[group] || group;

    const actions = document.createElement("div");
    actions.className = "axis-group__actions";

    const btnGroupAll = document.createElement("button");
    btnGroupAll.type = "button";
    btnGroupAll.textContent = "全选";
    btnGroupAll.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const item of list) setItemChecked(item.id, true);
    });

    const btnGroupNone = document.createElement("button");
    btnGroupNone.type = "button";
    btnGroupNone.textContent = "清空";
    btnGroupNone.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const item of list) setItemChecked(item.id, false);
    });

    actions.append(btnGroupAll, btnGroupNone);
    summary.append(title, actions);
    details.append(summary);

    const listWrap = document.createElement("div");
    listWrap.className = "axis-list axis-group__list";
    renderItems(list, listWrap);

    details.append(listWrap);
    panelList.append(details);
  }
}

function describe(item) {
  const r = item.range || {};
  const fmt = (v) => (Array.isArray(v) ? `[${v[0]}, ${v[1]}]` : "null");
  return [
    `${item.name.zh} (${item.name.en})`,
    "",
    `X: ${fmt(r.x)}  原文: ${item.raw?.x ?? ""}`,
    `Y: ${fmt(r.y)}  原文: ${item.raw?.y ?? ""}`,
    `Z: ${fmt(r.z)}  原文: ${item.raw?.z ?? ""}`,
    "",
    `主要覆盖变量: ${item.raw?.overlay ?? ""}`,
  ].join("\n");
}

function axisBoxFromRange(range) {
  const epsilon = 0.2;
  const asMinMax = (v) =>
    Array.isArray(v) && v.length === 2 ? [v[0], v[1]] : null;
  const rx = asMinMax(range?.x);
  const ry = asMinMax(range?.y);
  const rz = asMinMax(range?.z);
  if (!rx || !ry || !rz) return null;
  const [xmin, xmax] = rx;
  const [ymin, ymax] = ry;
  const [zmin, zmax] = rz;
  const sx = Math.max(Math.abs(xmax - xmin), epsilon);
  const sy = Math.max(Math.abs(ymax - ymin), epsilon);
  const sz = Math.max(Math.abs(zmax - zmin), epsilon);
  return {
    size: [sx, sy, sz],
    center: [(xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2],
  };
}

async function tryInitThree(ideologies, enabled, onPick) {
  const THREE = await import(`${base}vendor/three/three.module.js`);
  const { OrbitControls } = await import(`${base}vendor/three/OrbitControls.js`);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f8fa);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.up.set(0, 0, 1);
  camera.position.set(12, -42, 12);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if ("outputColorSpace" in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if ("outputEncoding" in renderer) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.1;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 1.15);
  dir.position.set(8, 10, 6);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-6, 4, -8);
  scene.add(fill);

  const contentGroup = new THREE.Group();
  scene.add(contentGroup);

  const gridSize = 10;
  const gridDivisions = 10;
  const gridMajor = 0xc0c9d6;
  const gridMinor = 0xd8dee8;
  const gridXZ = new THREE.GridHelper(gridSize, gridDivisions, gridMajor, gridMinor);
  const gridXY = new THREE.GridHelper(gridSize, gridDivisions, gridMajor, gridMinor);
  const gridYZ = new THREE.GridHelper(gridSize, gridDivisions, gridMajor, gridMinor);
  gridXY.rotation.x = Math.PI / 2;
  gridYZ.rotation.z = Math.PI / 2;
  contentGroup.add(gridXZ, gridXY, gridYZ);

  const axisGroup = new THREE.Group();
  contentGroup.add(axisGroup);

  const axisLength = 6;
  const axisColors = {
    x: 0xff3b3b,
    y: 0x20d67b,
    z: 0x2f7bff,
  };

  function addAxisLine(direction, color) {
    const material = new THREE.LineBasicMaterial({ color });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      direction.clone().multiplyScalar(-axisLength),
      direction.clone().multiplyScalar(axisLength),
    ]);
    axisGroup.add(new THREE.Line(geometry, material));

    const arrow = new THREE.ArrowHelper(
      direction.clone().normalize(),
      direction.clone().multiplyScalar(axisLength),
      0.7,
      color,
      0.25,
      0.15
    );
    axisGroup.add(arrow);
  }

  function makeLabel(text, color) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const padding = 14;
    const fontSize = 22;
    const fontFamily = "system-ui, -apple-system, Segoe UI, Arial, sans-serif";
    ctx.font = `${fontSize}px ${fontFamily}`;
    const lines = text.split("\n");
    const widths = lines.map((line) => ctx.measureText(line).width);
    const width = Math.max(...widths) + padding * 2;
    const height = lines.length * (fontSize + 6) + padding * 2;
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    lines.forEach((line, index) => {
      ctx.fillText(line, padding, padding + index * (fontSize + 6));
    });
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width / 70, canvas.height / 70, 1);
    return sprite;
  }

  function addAxisLabels() {
    const labels = [
      {
        pos: new THREE.Vector3(axisLength + 0.6, 0.2, 0),
        text: "X 经济秩序轴\n右 (+)",
        color: "#c62828",
      },
      {
        pos: new THREE.Vector3(-axisLength - 0.6, 0.2, 0),
        text: "X 左 (-)",
        color: "#c62828",
      },
      {
        pos: new THREE.Vector3(0.2, axisLength + 0.6, 0),
        text: "Y 自由边界轴\n右 (+)",
        color: "#1b8e5a",
      },
      {
        pos: new THREE.Vector3(0.2, -axisLength - 0.6, 0),
        text: "Y 左 (-)",
        color: "#1b8e5a",
      },
      {
        pos: new THREE.Vector3(0, 0.2, axisLength + 0.6),
        text: "Z 权利本体轴\n右 (+)",
        color: "#1f5fc4",
      },
      {
        pos: new THREE.Vector3(0, 0.2, -axisLength - 0.6),
        text: "Z 左 (-)",
        color: "#1f5fc4",
      },
    ];
    labels.forEach((label) => {
      const sprite = makeLabel(label.text, label.color);
      sprite.position.copy(label.pos);
      axisGroup.add(sprite);
    });
  }

  function addAxisTicks() {
    const tickMaterial = new THREE.LineBasicMaterial({ color: 0x5b6b7c });
    const tickSize = 0.18;
    const ticks = new THREE.Group();
    for (let i = -5; i <= 5; i += 1) {
      if (i === 0) continue;
      const xTick = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i, -tickSize, 0),
        new THREE.Vector3(i, tickSize, 0),
      ]);
      const yTick = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, i, -tickSize),
        new THREE.Vector3(0, i, tickSize),
      ]);
      const zTick = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-tickSize, 0, i),
        new THREE.Vector3(tickSize, 0, i),
      ]);
      ticks.add(new THREE.Line(xTick, tickMaterial));
      ticks.add(new THREE.Line(yTick, tickMaterial));
      ticks.add(new THREE.Line(zTick, tickMaterial));
    }
    axisGroup.add(ticks);
  }

  addAxisLine(new THREE.Vector3(1, 0, 0), axisColors.x);
  addAxisLine(new THREE.Vector3(0, 1, 0), axisColors.y);
  addAxisLine(new THREE.Vector3(0, 0, 1), axisColors.z);
  addAxisLabels();
  addAxisTicks();

  const meshesById = new Map();
  const pickables = [];

  for (const item of ideologies) {
    const box = axisBoxFromRange(item.range);
    if (!box) continue;
    const geometry = new THREE.BoxGeometry(box.size[0], box.size[1], box.size[2]);
    const color = new THREE.Color(item.color || colorFromId(item.id));
    const emissive = color.clone().multiplyScalar(0.75);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive,
      shininess: 80,
      specular: new THREE.Color(0x444444),
      transparent: true,
      opacity: 0.75,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(box.center[0], box.center[1], box.center[2]);
    mesh.visible = enabled.has(item.id);
    mesh.userData = { id: item.id };
    contentGroup.add(mesh);
    meshesById.set(item.id, mesh);
    pickables.push(mesh);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  function fitCameraToBox(box) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    let maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim < 0.1) {
      maxDim = 10;
    }
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = maxDim / (2 * Math.tan(fov / 2));
    const fitWidth = fitHeight / camera.aspect;
    const distance = Math.max(1.35 * Math.max(fitHeight, fitWidth), 4);
    const direction = new THREE.Vector3(2, -7, 2).normalize();
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    camera.near = Math.max(distance / 100, 0.1);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  const initialBox = new THREE.Box3().setFromObject(contentGroup);
  fitCameraToBox(initialBox);
  const initialCameraPosition = camera.position.clone();
  const initialTarget = controls.target.clone();
  const initialZoom = camera.zoom;

  function setPointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    pointer.set(x, y);
  }

  canvas.addEventListener("pointerdown", (event) => {
    setPointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return;
    const id = hits[0].object?.userData?.id;
    if (id) onPick(id);
  });

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return {
    setVisible(id, visible) {
      const mesh = meshesById.get(id);
      if (mesh) mesh.visible = visible;
    },
    resetView() {
      camera.position.copy(initialCameraPosition);
      controls.target.copy(initialTarget);
      camera.zoom = initialZoom;
      camera.updateProjectionMatrix();
      controls.update();
    },
    dispose() {
      ro.disconnect();
      renderer.dispose();
    },
  };
}

async function main() {
  if (!panelList || !panelDetail || !canvas || !btnAll || !btnNone) return;

  const header = document.querySelector(".site-header");
  const axisApp = document.querySelector(".axis-app");
  const axisBody = document.querySelector(".axis-body");
  const rootStyle = axisApp?.style;
  const syncLayoutVars = () => {
    if (!rootStyle || !axisBody) return;
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const bodyRect = axisBody.getBoundingClientRect();
    const bodyWidth = Math.max(bodyRect.width, 1);
    const bodyHeight = Math.max(bodyRect.height, 1);
    const minPanelWidth = 280;
    // Match CSS breakpoint so layout mode doesn't diverge from media query.
    const isNarrow =
      window.matchMedia &&
      window.matchMedia("(max-aspect-ratio: 1/1)").matches;
    let canvasWidth = bodyWidth;
    let canvasHeight = bodyHeight;
    if (isNarrow) {
      canvasHeight = bodyWidth;
      const maxHeight = bodyHeight * 0.7;
      if (canvasHeight > maxHeight) canvasHeight = maxHeight;
    } else {
      canvasWidth = bodyHeight;
      const maxWidth = bodyWidth * 0.7;
      if (canvasWidth > maxWidth) canvasWidth = maxWidth;
      const remainingWidth = bodyWidth - canvasWidth;
      if (remainingWidth < minPanelWidth) {
        canvasWidth = Math.max(bodyWidth - minPanelWidth, 1);
      }
    }
    canvasWidth = Math.max(canvasWidth, 1);
    canvasHeight = Math.max(canvasHeight, 1);
    rootStyle.setProperty("--axis-header-height", `${Math.ceil(headerHeight)}px`);
    rootStyle.setProperty("--axis-canvas-width", `${Math.floor(canvasWidth)}px`);
    rootStyle.setProperty("--axis-canvas-height", `${Math.floor(canvasHeight)}px`);
  };
  syncLayoutVars();
  if (header && "ResizeObserver" in window) {
    const headerObserver = new ResizeObserver(syncLayoutVars);
    headerObserver.observe(header);
  }
  if (axisApp && axisBody && "ResizeObserver" in window) {
    const layoutObserver = new ResizeObserver(syncLayoutVars);
    layoutObserver.observe(axisApp);
    layoutObserver.observe(axisBody);
  }
  window.addEventListener("resize", syncLayoutVars);

  let threeApi = null;

  try {
    const ideologies = (await loadIdeologies()).map((item) => ({
      ...item,
      color: item.color || colorFromId(item.id),
    }));
    const byId = new Map(ideologies.map((x) => [x.id, x]));
    const enabled = new Set(
      ideologies.filter((item) => item.group !== "contemporary").map((x) => x.id)
    );

    const onSelect = (id) => {
      const item = byId.get(id);
      if (item) setDetail(describe(item));
    };

    renderList(
      ideologies,
      enabled,
      (id, checked) => {
        if (checked) enabled.add(id);
        else enabled.delete(id);
        if (threeApi) threeApi.setVisible(id, checked);
      },
      onSelect
    );

    btnAll.addEventListener("click", () => {
      for (const id of byId.keys()) enabled.add(id);
      for (const input of panelList.querySelectorAll("input[type=checkbox]"))
        input.checked = true;
      if (threeApi) for (const id of byId.keys()) threeApi.setVisible(id, true);
    });
    btnNone.addEventListener("click", () => {
      enabled.clear();
      for (const input of panelList.querySelectorAll("input[type=checkbox]"))
        input.checked = false;
      if (threeApi) for (const id of byId.keys()) threeApi.setVisible(id, false);
    });
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        if (threeApi) threeApi.resetView();
      });
    }

    setDetail("点击色块或左侧条目查看详情。");
    setNotice("");

    try {
      threeApi = await tryInitThree(ideologies, enabled, onSelect);
    } catch (error) {
      console.warn("three.js init failed; keep list-only mode.", error);
      setDetail(
        "3D 依赖加载失败（可能是网络/策略限制）。你仍可在左侧查看解析结果；稍后可把 three.js vendoring 到 view/vendor/ 以离线运行。"
      );
      setNotice(
        "3D 模块未能加载，当前为列表模式。\n请检查 view/vendor/three/ 是否存在，并确认 OrbitControls.js 内部引用已指向本地 three.module.js。"
      );
    }
  } catch (error) {
    setDetail(
      "缺少数据：请先运行 node view/scripts/split_books.mjs 生成 ideologies.extracted.json。"
    );
    setNotice(
      "3D 数据未就绪。\n请先生成 ideologies.extracted.json 再刷新页面。"
    );
    console.error(error);
  }
}

main();
