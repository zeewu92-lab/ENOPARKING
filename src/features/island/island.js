/**
 * 語未央島嶼（Three.js 場景 + 全屏裝飾介面）。
 * 框架無關：由 IslandCard.jsx 傳入 THREE / OrbitControls / host 後掛載。
 * 場景只讀取 host 提供的資料，不直接存取學習算法。
 */
export function mountIsland(slot, { THREE, OrbitControls, host, onFail = null, onFullscreenChange = null } = {}) {
  const 货币 = host.currencyName || '詞露';
  slot.classList.add('isl-slot');
  slot.innerHTML = `
    <section class="isl-card" data-id="花园卡" aria-label="我的島嶼花園">
      <div class="isl-canvas" data-id="岛屿容器"></div>
      <div class="isl-text">
        <small>我的花園</small>
        <div class="isl-big" data-id="花园大"></div>
        <div class="isl-sub" data-id="花园副"></div>
        <div class="isl-actions">
          <button type="button" class="isl-glass" data-id="收取" hidden></button>
          <button type="button" class="isl-glass" data-id="去花园">去花園打理 ›</button>
        </div>
      </div>
    </section>`;
  const ui = document.createElement('div');
  ui.className = 'isl-ui';
  ui.innerHTML = `
    <div class="isl-bar" data-id="全屏条" hidden>
      <button type="button" class="isl-pill" data-id="返回">‹ 返回</button>
      <span class="isl-coin"><i class="isl-dot"></i>${货币} <b data-id="代币数2">0</b></span>
      <span class="isl-lv"><span data-id="级别">Lv.1</span><span class="isl-meter"><u data-id="经验条"></u></span></span>
      <span class="isl-grow"></span>
      <button type="button" class="isl-pill isl-hot" data-id="收取2" hidden></button>
      <button type="button" class="isl-pill" data-id="昼夜" aria-label="切換時間">現在時間</button>
      <button type="button" class="isl-pill" data-id="复位" aria-label="復位視角">復位</button>
    </div>
    <button type="button" class="isl-fab" data-id="开商店" hidden>🌿 裝飾</button>
    <section class="isl-sheet" data-id="商店面板" hidden>
      <h2><span>裝飾花園</span><span class="isl-subtle">${货币} <b data-id="商店代币">0</b></span><button type="button" class="isl-x" data-id="关商店" aria-label="收起">✕</button></h2>
      <div class="isl-shelf" data-id="货架"></div>
    </section>
    <section class="isl-sheet isl-actionbar" data-id="操作条" hidden></section>
    <div class="isl-toast" data-id="吐司" role="status"></div>`;
  document.body.appendChild(ui);
  const $ = (id) => slot.querySelector(`[data-id="${id}"]`) || ui.querySelector(`[data-id="${id}"]`);
  const 失败 = (消息) => {
    $("岛屿容器").textContent = 消息; ui.remove();
    if (onFail) onFail(消息);
    return { dispose() { slot.innerHTML = ""; }, refresh() {} };
  };


    let 渲染器;
    try {
      渲染器 = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (错误) {
      return 失败("目前的瀏覽器無法啟動 3D 畫面");
    }

    const 场景 = new THREE.Scene();
    场景.background = new THREE.Color(0x101a2b);
    场景.fog = new THREE.Fog(0xcbd8d0, 58, 175);
    const 天空参数 = { uniforms: { uSunHeight:{value:0.45}, uTwilight:{value:0}, uNight:{value:0}, uSunDir:{value:new THREE.Vector3(-0.4,0.5,0.6).normalize()}, uTime:{value:0} } };
    const 天空穹顶 = new THREE.Mesh(new THREE.SphereGeometry(220,48,32), new THREE.ShaderMaterial({
      uniforms:天空参数.uniforms, side:THREE.BackSide, depthWrite:false,
      vertexShader:`varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`precision highp float; varying vec3 vDirection; uniform float uSunHeight; uniform float uTwilight; uniform float uNight; uniform vec3 uSunDir; uniform float uTime;
      float hash(vec3 p){p=fract(p*0.3183099+vec3(0.1,0.2,0.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      void main(){vec3 d=normalize(vDirection);float h=clamp(d.y*0.5+0.5,0.0,1.0);
      vec3 nightTop=vec3(0.018,0.035,0.085),nightHorizon=vec3(0.10,0.13,0.21);vec3 dayTop=vec3(0.16,0.43,0.70),dayMid=vec3(0.42,0.68,0.83),dayHorizon=vec3(0.83,0.82,0.75);
      vec3 col=mix(nightHorizon,nightTop,pow(h,0.65));col=mix(col,dayHorizon,smoothstep(0.0,0.72,h)*(1.0-uNight));col=mix(col,dayMid,smoothstep(0.16,0.72,h)*(1.0-uNight));col=mix(col,dayTop,smoothstep(0.48,0.98,h)*(1.0-uNight));
      float band=pow(1.0-abs(d.y),5.0);col=mix(col,vec3(0.95,0.38,0.23),clamp(uTwilight*band*0.95,0.0,0.85));float sd=max(dot(d,normalize(uSunDir)),0.0);float disk=smoothstep(0.9992,0.99975,sd)*(1.0-uNight*0.7);float halo=pow(sd,48.0)*(1.0-uNight*0.75);col+=vec3(1.0,0.68,0.35)*halo*0.32+vec3(1.0,0.88,0.66)*disk*2.0;
      float star=step(0.9978,hash(floor(d*850.0)))*smoothstep(0.15,0.85,h)*uNight;col+=vec3(0.75,0.84,1.0)*star*(0.65+0.35*sin(uTime*1.2+hash(floor(d*850.0))*6.28));gl_FragColor=vec4(col,1.0);}`
    }));
    天空穹顶.frustumCulled=false; 场景.add(天空穹顶);
    const 台北日照={日出:6,日落:18,日间比例:0.5,夜间比例:0};
    function 计算台北日出日落(日期=new Date()){
      const 纬度=25.033,经度=121.5654,时区=8;
      const n=Math.floor((Date.UTC(日期.getUTCFullYear(),日期.getUTCMonth(),日期.getUTCDate())-Date.UTC(日期.getUTCFullYear(),0,0))/86400000);
      const g=2*Math.PI/365*(n-1);
      const eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
      const dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
      const lat=纬度*Math.PI/180;const ch=Math.cos(90.833*Math.PI/180)/(Math.cos(lat)*Math.cos(dec))-Math.tan(lat)*Math.tan(dec);
      const ha=Math.acos(Math.max(-1,Math.min(1,ch)))*180/Math.PI;const noon=720-4*经度-eq+时区*60;
      return {日出:(noon-4*ha)/60,日落:(noon+4*ha)/60};
    }

    const 相机 = new THREE.PerspectiveCamera(39, 1, 0.1, 240);
    const 初始相机 = new THREE.Vector3(22, 16, 27);
    相机.position.copy(初始相机);

    渲染器.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    渲染器.outputEncoding = THREE.sRGBEncoding;
    渲染器.toneMapping = THREE.ACESFilmicToneMapping;
    渲染器.toneMappingExposure = 1.0;
    $("岛屿容器").appendChild(渲染器.domElement);
    渲染器.domElement.setAttribute("aria-label", "可旋转观察的三维漂浮岛屿");

    const 控制器 = new OrbitControls(相机, 渲染器.domElement);
    控制器.enableDamping = true;
    控制器.dampingFactor = 0.085;
    控制器.enablePan = false;
    // 保留自由缩放，近距离观察与远景总览都不做硬性距离锁定。
    控制器.minDistance = 3.8;
    控制器.maxDistance = 100;
    控制器.enableZoom = true;
    控制器.zoomSpeed = 0.82;
    控制器.minPolarAngle = 0.28;
    控制器.maxPolarAngle = Math.PI * 0.49;
    控制器.target.set(0, 2.4, 0);
    控制器.rotateSpeed = 0.78;
    控制器.enabled = false;            // 首頁小卡片裡不攔截手勢，頁面才能正常捲動；進入全屏花園才啟用
    控制器.autoRotate = true; 控制器.autoRotateSpeed = 0.7;
    渲染器.domElement.style.touchAction = "pan-y";

    const 环境光 = new THREE.HemisphereLight(0xf0eadc, 0x596b50, 1.15);
    场景.add(环境光);
    const 阳光 = new THREE.DirectionalLight(0xffe6c5, 2.0);
    阳光.position.set(-18, 30, 20);
    场景.add(阳光);
    阳光.castShadow = true;
    阳光.shadow.mapSize.set(1024, 1024);
    阳光.shadow.camera.left = -18;
    阳光.shadow.camera.right = 18;
    阳光.shadow.camera.top = 22;
    阳光.shadow.camera.bottom = -18;
    阳光.shadow.bias = -0.00035;
    渲染器.shadowMap.enabled = true;
    渲染器.shadowMap.type = THREE.PCFSoftShadowMap;

    const 岛屿 = new THREE.Group();
    场景.add(岛屿);
    const 材质 = (颜色, 粗糙度 = 0.9, 其他 = {}) => new THREE.MeshStandardMaterial({ color: 颜色, roughness: 粗糙度, ...其他 });
    const 草材质 = 材质(0x6f8757);
    const 土材质 = 材质(0x927e6b);
    const 石材质组 = [0x706d69, 0x817c72, 0x625f5c, 0x938777].map(色 => 材质(色));
    const 木材质 = 材质(0x8b5938);
    const 木亮材质 = 材质(0xb77c4a);
    const 屋墙材质 = 材质(0xf0dfbd);
    const 屋顶材质 = [0x98594b, 0xb46c55, 0x804a42].map(色 => 材质(色));
    const 叶材质组 = [0x526e50, 0x64835a, 0x78946a, 0x91a77b].map(色 => 材质(色, 0.94, { side: THREE.DoubleSide }));
    const 苔材质 = 材质(0x687f5c);
    let 随机种子 = 0x51a7e;
    function 随机() {
      let t = 随机种子 += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    const 石头随机 = (最小, 最大) => 最小 + 随机() * (最大 - 最小);

    // 用顶点扰动生成不规则岩层，避免岛体像规则倒圆锥。
    function 创建岩层(半径, 高度, 细分, 中心Y, 缩放 = 1) {
      const 几何 = new THREE.ConeGeometry(半径, 高度, 18, 5, false);
      const 顶点 = 几何.attributes.position;
      for (let i = 0; i < 顶点.count; i++) {
        const x = 顶点.getX(i), y = 顶点.getY(i), z = 顶点.getZ(i);
        const 扰动 = 1 + 0.09 * Math.sin(x * 1.7 + z * 0.8) + 0.055 * Math.cos(z * 2.3 - y);
        顶点.setXYZ(i, x * 扰动, y + (Math.abs(y) < 高度 * 0.42 ? Math.sin(x * 1.4 + z) * 0.16 : 0), z * 扰动);
      }
      几何.rotateX(Math.PI);
      几何.computeVertexNormals();
      const 岩石 = new THREE.Mesh(几何, 石材质组[Math.floor(随机() * 石材质组.length)]);
      岩石.position.set(0, 中心Y, 0);
      岩石.scale.setScalar(缩放);
      岩石.castShadow = true;
      岩石.receiveShadow = true;
      岛屿.add(岩石);
      return 岩石;
    }
    创建岩层(7.8, 10.5, 18, -5.1);
    创建岩层(5.4, 5.8, 18, -8.4, 0.96);

    const 草地几何 = new THREE.CylinderGeometry(8.1, 7.55, 0.82, 32, 3);
    const 草顶点 = 草地几何.attributes.position;
    for (let i = 0; i < 草顶点.count; i++) {
      const x = 草顶点.getX(i), y = 草顶点.getY(i), z = 草顶点.getZ(i);
      const 扰动 = 1 + 0.035 * Math.sin(Math.atan2(z, x) * 11) + 0.018 * Math.cos(x * 2.1 + z);
      草顶点.setXYZ(i, x * 扰动, y + (y > 0 ? 0.04 * Math.sin(x * 1.7 + z * 1.3) : 0), z * 扰动);
    }
    草地几何.computeVertexNormals();
    const 草地 = new THREE.Mesh(草地几何, 草材质);
    草地.position.y = -0.12;
    草地.receiveShadow = true;
    草地.castShadow = true;
    岛屿.add(草地);

    // 草地边缘铺设土层和随机碎石，柔化草岩交界。
    const 土边 = new THREE.Mesh(new THREE.TorusGeometry(7.78, 0.24, 5, 48), 土材质);
    土边.rotation.x = Math.PI / 2;
    土边.position.y = -0.31;
    土边.scale.set(1, 0.98, 1);
    岛屿.add(土边);
    for (let i = 0; i < 46; i++) {
      const 角 = 随机() * Math.PI * 2;
      const 半径 = 石头随机(7.3, 8.0);
      const 石几何 = new THREE.DodecahedronGeometry(石头随机(0.12, 0.34), 0);
      const 石头 = new THREE.Mesh(石几何, 石材质组[i % 石材质组.length]);
      石头.position.set(Math.cos(角) * 半径, 石头随机(-0.45, 0.05), Math.sin(角) * 半径);
      石头.rotation.set(随机(), 随机() * 3, 随机());
      石头.scale.set(1.2, 0.65, 0.9);
      石头.castShadow = true;
      岛屿.add(石头);
    }
    for (let i = 0; i < 22; i++) {
      const 角 = 随机() * Math.PI * 2;
      const 半径 = 石头随机(6.9, 7.7);
      const 苔 = new THREE.Mesh(new THREE.SphereGeometry(石头随机(0.16, 0.36), 7, 5), 苔材质);
      苔.position.set(Math.cos(角) * 半径, 石头随机(-2.8, -0.7), Math.sin(角) * 半径);
      苔.scale.set(1.2, 0.45, 0.85);
      岛屿.add(苔);
    }

    // ---------- 小工具 ----------
    const 树随机 = (() => {            // 帶種子的隨機，每次載入同一棵樹
      let a = 20261022;
      return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const 随范围 = (最小, 最大) => 最小 + 树随机() * (最大 - 最小);
    const 夹 = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const 平滑 = (t) => { t = 夹(t); return t * t * (3 - 2 * t); };
    const 回弹 = (t) => { t = 夹(t); const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    
    // ---------- 參數（想調節奏改這裡）----------
    const 树高 = 7.0;
    const 树苗比例 = 0.17;            // 剛出土時樹幹高度占成樹的比例
    const 生长总秒数 = 90;             // 從樹苗到大樹需要幾秒
    const 树状态 = { 进度: 0, 速度: 1, 播放中: false, 上次: performance.now() };
    
    const 树组 = new THREE.Group();
    树组.position.set(2.0, 0.25, -2.0);
    岛屿.add(树组);
    
    // 樹幹高度比例隨進度線性成長（分支出現時間由此反推，確保枝一定長在已經長到的樹幹上）
    const 树干比例 = (p) => 树苗比例 + (1 - 树苗比例) * 夹(p / 0.8);
    const 高度起点 = (y) => 0.8 * 夹((y / 树高 - 树苗比例) / (1 - 树苗比例)) + 0.02;
    
    // 枝條：原點放在底部，之後只靠 scale 控制「長出來」
    function 创建生长枝(起点, 终点, 底半径, 顶半径, 材质对象) {
      const 向量 = new THREE.Vector3().subVectors(终点, 起点);
      const 长 = 向量.length();
      const 几何 = new THREE.CylinderGeometry(顶半径, 底半径, 长, 6, 1);
      几何.translate(0, 长 / 2, 0);
      const 网格 = new THREE.Mesh(几何, 材质对象);
      网格.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), 向量.clone().normalize());
      网格.position.copy(起点);
      网格.scale.set(0.0001, 0.0001, 0.0001);
      网格.castShadow = true;
      树组.add(网格);
      return 网格;
    }
    
    // ---------- 樹幹 ----------
    const 树根 = new THREE.Vector3(0, 0, 0);
    const 树顶 = new THREE.Vector3(0.35, 树高, -0.15);
    const 树干 = 创建生长枝(树根, 树顶, 0.62, 0.16, 木材质);
    const 树干顶 = new THREE.Vector3();   // 目前樹幹頂端位置（每幀更新）
    
    // ---------- 枝條（主枝 + 次枝）----------
    const 树枝组 = [];
    const 叶簇组 = [];
    for (let i = 0; i < 10; i++) {
      const 高 = 2.0 + i * 0.43;
      const 角 = i * 2.399;
      const 长 = 1.0 + Math.sin(i * 1.7) * 0.42;
      const 起点 = 树根.clone().lerp(树顶, 高 / 树高);
      const 终点 = new THREE.Vector3(
        起点.x + Math.sin(角) * 长,
        高 + 0.9 + (i % 3) * 0.24,
        起点.z + Math.cos(角) * 长
      );
      const 主 = {
        网格: 创建生长枝(起点, 终点, 0.22 - i * 0.009, 0.055, 木材质),
        起点, 终点, 父: null, 生长: 0,
        起始: 高度起点(高) + 0.01, 时长: 0.2, 终粗: 1
      };
      树枝组.push(主);
    
      const 次终点 = new THREE.Vector3(
        终点.x + (终点.x - 起点.x) * 0.35 + Math.cos(角) * 0.35,
        终点.y + 0.6,
        终点.z + (终点.z - 起点.z) * 0.35 + Math.sin(角) * 0.35
      );
      const 次 = {
        网格: 创建生长枝(终点, 次终点, 0.085, 0.025, 木亮材质),
        起点: 终点, 终点: 次终点, 父: 主, 生长: 0,
        起始: 主.起始 + 0.13, 时长: 0.18, 终粗: 1
      };
      树枝组.push(次);
    
      // 葉簇長在枝梢：主枝梢 2 簇、次枝梢 2 簇，等枝長到七成才冒出來
      for (const [枝, 点] of [[主, 终点], [次, 次终点]]) {
        for (let k = 0; k < 2; k++) {
          const 位置 = 点.clone().add(new THREE.Vector3(随范围(-0.55, 0.55), 随范围(-0.1, 0.65), 随范围(-0.55, 0.55)));
          const 大小 = 随范围(0.58, 1.1) * (位置.y > 8.4 ? 0.82 : 1);
          const 网格 = new THREE.Mesh(new THREE.SphereGeometry(大小, 10, 8), 叶材质组[Math.floor(树随机() * 叶材质组.length)]);
          网格.position.copy(位置);
          const 目标 = new THREE.Vector3(1.0, 随范围(0.82, 1.18), 0.95);
          网格.scale.set(0.0001, 0.0001, 0.0001);
          网格.rotation.set(树随机(), 树随机() * Math.PI, 树随机());
          网格.castShadow = true;
          网格.receiveShadow = true;
          树组.add(网格);
          叶簇组.push({
            网格, 相位: 树随机() * Math.PI * 2, 原位: 网格.rotation.z,
            目标缩放: 目标, 起始: 枝.起始 + 枝.时长 * 0.7 + 随范围(0, 0.04), 时长: 0.16
          });
        }
      }
    }
    
    // 樹冠頂部：成樹時補幾簇，讓樹梢收得圓一點
    for (let i = 0; i < 6; i++) {
      const 角 = i * 2.399;
      const 位置 = new THREE.Vector3(Math.cos(角) * 随范围(0.3, 1.1), 随范围(7.2, 8.8), Math.sin(角) * 随范围(0.3, 1.1));
      const 网格 = new THREE.Mesh(new THREE.SphereGeometry(随范围(0.6, 0.95), 10, 8), 叶材质组[i % 叶材质组.length]);
      网格.position.copy(位置);
      网格.scale.set(0.0001, 0.0001, 0.0001);
      网格.castShadow = true;
      树组.add(网格);
      叶簇组.push({
        网格, 相位: 树随机() * Math.PI * 2, 原位: 网格.rotation.z,
        目标缩放: new THREE.Vector3(1, 随范围(0.85, 1.1), 0.95), 起始: 0.78 + i * 0.03, 时长: 0.18
      });
    }
    
    // ---------- 樹苗頂芽：永遠跟著樹幹頂端，一路從兩片嫩葉長成樹冠領頭簇 ----------
    const 顶芽组 = [];
    for (let i = 0; i < 3; i++) {
      const 网格 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), 叶材质组[(i + 1) % 叶材质组.length]);
      网格.castShadow = true;
      树组.add(网格);
      顶芽组.push({ 网格, 偏移: new THREE.Vector3(Math.cos(i * 2.1) * 0.16, 0.08 + i * 0.05, Math.sin(i * 2.1) * 0.16) });
    }
    
    // ---------- 葉色：嫩綠 → 深綠 ----------
    const 成熟色 = 叶材质组.map(m => m.color.clone());
    const 嫩叶色 = 成熟色.map(c => c.clone().lerp(new THREE.Color(0xd2e08c), 0.55));
    
    // ---------- 每幀更新 ----------
    function 更新树生长() {
      const 现在 = performance.now();
      const 秒差 = Math.min(0.1, (现在 - 树状态.上次) / 1000);
      树状态.上次 = 现在;
      if (树状态.播放中) 树状态.进度 = Math.min(1, 树状态.进度 + 秒差 * 树状态.速度 / 生长总秒数);
      const p = 树状态.进度;
      const 时间 = 现在 / 1000;
    
      // 樹幹：長高 + 變粗
      const f = 树干比例(p);
      const 粗 = 0.22 + 0.78 * 平滑(p / 0.95);
      树干.scale.set(粗, f, 粗);
      树干顶.copy(树顶).multiplyScalar(f);
    
      // 枝條：先長長，再慢慢變粗；次枝跟著主枝梢移動
      for (const 枝 of 树枝组) {
        const g = 平滑((p - 枝.起始) / 枝.时长);
        枝.生长 = g;
        if (枝.父) 枝.网格.position.copy(枝.父.起点).lerp(枝.父.终点, 枝.父.生长);
        枝.网格.visible = g > 0.001;
        const 枝粗 = g * (0.5 + 0.5 * 平滑(p));
        枝.网格.scale.set(枝粗, Math.max(g, 0.0001), 枝粗);
      }
    
      // 葉簇：彈出式長大
      for (const 叶 of 叶簇组) {
        const g = 回弹((p - 叶.起始) / 叶.时长);
        叶.网格.visible = g > 0.001;
        叶.网格.scale.set(叶.目标缩放.x * g, 叶.目标缩放.y * g, 叶.目标缩放.z * g);
      }
    
      // 頂芽：隨樹幹頂端上升，由小變大
      const 芽大小 = 0.22 + 0.85 * 平滑(p / 0.85);
      for (const 芽 of 顶芽组) {
        芽.网格.position.copy(树干顶).add(芽.偏移.clone().multiplyScalar(0.4 + 芽大小));
        芽.网格.scale.set(芽大小, 芽大小 * 0.85, 芽大小);
      }
    
      // 葉色漸變
      const 熟 = 平滑(p / 0.9);
      叶材质组.forEach((m, i) => m.color.copy(嫩叶色[i]).lerp(成熟色[i], 熟));
    
      // 幼樹隨風晃得更明顯，成樹沉穩
      const 摆幅 = 0.03 * (1.15 - p);
      树组.rotation.z = Math.sin(时间 * 0.9) * 摆幅;
      树组.rotation.x = Math.cos(时间 * 0.7) * 摆幅 * 0.6;
    }
    
    function 重播树() {
      树状态.进度 = 0;
      树状态.播放中 = true;
      树状态.上次 = performance.now();
    }

    // 程序化草丛与野花，控制数量以兼顾手机性能。
    const 地被列表 = [];
    const 草丛材质组 = [材质(0x438849), 材质(0x76ad59), 材质(0x9abf69)];
    for (let i = 0; i < 155; i++) {
      const 角 = 随机() * Math.PI * 2;
      const 半径 = Math.sqrt(随机()) * 7.2;
      const x = Math.cos(角) * 半径, z = Math.sin(角) * 半径;
      if ((x - 2) ** 2 + (z + 2) ** 2 < 5.5 || (x + 2) ** 2 + (z - 2) ** 2 < 5) continue;
      const 高 = 石头随机(0.16, 0.48);
      const 草 = new THREE.Mesh(new THREE.ConeGeometry(石头随机(0.045, 0.09), 高, 4), 草丛材质组[i % 草丛材质组.length]);
      草.position.set(x, 0.24 + 高 * 0.35, z);
      草.rotation.z = 石头随机(-0.28, 0.28);
      草.rotation.x = 石头随机(-0.18, 0.18);
      岛屿.add(草);
      地被列表.push({ 网格: 草, x, z });
    }
    const 花材质组 = [材质(0xc9788c), 材质(0xe8b9c2), 材质(0xf3e8d8)];
    for (let i = 0; i < 20; i++) {
      const 角 = 随机() * Math.PI * 2, 半径 = 石头随机(3.1, 6.9);
      const x = Math.cos(角) * 半径, z = Math.sin(角) * 半径;
      const 花组 = new THREE.Group();
      const 花茎 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.28, 4), 草丛材质组[0]);
      花茎.position.y = 0.36;
      花组.add(花茎);
      for (let j = 0; j < 5; j++) {
        const 花瓣 = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), 花材质组[i % 花材质组.length]);
        const 角度 = j * Math.PI * 2 / 5;
        花瓣.position.set(Math.cos(角度) * 0.09, 0.51, Math.sin(角度) * 0.09);
        花瓣.scale.set(1, 0.65, 0.8);
        花组.add(花瓣);
      }
      花组.position.set(x, 0, z);
      岛屿.add(花组);
      地被列表.push({ 网格: 花组, x, z });
    }

    // ================================================================
    //  房屋
    // ================================================================
    const 地面Y = 0.27;                              // 草地表面高度（島嶼本地座標）
    const 窗材质 = 材质(0xf6e7b4, 0.5, { emissive: 0xffc46b, emissiveIntensity: 0 });
    function 创建房屋(x, z, 比例, 朝向 = 0) {
      const 房组 = new THREE.Group();
      const 加块 = (w, h, d, 材, px, py, pz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), 材);
        m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; 房组.add(m); return m;
      };
      加块(2.6, 2.0, 2.35, 屋墙材质, 0, 1.0, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) 加块(0.13, 2.04, 0.13, 木材质, sx * 1.3, 1.0, sz * 1.175);
      const 屋顶几何 = new THREE.ConeGeometry(1, 1.25, 4); 屋顶几何.rotateY(Math.PI / 4);
      const 屋顶 = new THREE.Mesh(屋顶几何, 屋顶材质[0]);
      屋顶.scale.set(2.1, 1, 1.92); 屋顶.position.y = 2.0 + 0.62; 屋顶.castShadow = true; 房组.add(屋顶);
      加块(0.36, 0.9, 0.36, 石材质组[0], 0.75, 2.75, -0.5);
      加块(0.56, 1.1, 0.08, 木材质, 0, 0.55, 1.2);
      加块(0.92, 0.1, 0.42, 石材质组[1], 0, 0.05, 1.5);
      for (const sx of [-0.85, 0.85]) {
        加块(0.5, 0.5, 0.07, 窗材质, sx, 1.25, 1.18);
        加块(0.56, 0.05, 0.09, 木亮材质, sx, 1.25, 1.19);
        加块(0.05, 0.56, 0.09, 木亮材质, sx, 1.25, 1.19);
      }
      加块(0.07, 0.5, 0.5, 窗材质, 1.3, 1.25, 0);
      房组.position.set(x, 地面Y, z);
      房组.rotation.y = 朝向;
      房组.scale.setScalar(比例);
      岛屿.add(房组);
      return 房组;
    }
    创建房屋(-2, 2, 0.95, 0.35);

    // ================================================================
    //  日夜：依台北真實時間（或測試時間）驅動天空與光照
    // ================================================================
    const 日照 = 计算台北日出日落();
    const 月光 = new THREE.DirectionalLight(0x9db4ff, 0);
    场景.add(月光);
    const 太阳向 = new THREE.Vector3();
    const 色 = { 夜天: new THREE.Color(0x3a4a70), 日天: new THREE.Color(0xf0eadc), 夜地: new THREE.Color(0x1b2430), 日地: new THREE.Color(0x596b50),
                 暖: new THREE.Color(0xff9a55), 白: new THREE.Color(0xffe6c5), 雾夜: new THREE.Color(0x151f33), 雾日: new THREE.Color(0xcbd8d0), 雾暮: new THREE.Color(0xd9a98a) };
    const 平滑步 = (a, b, x) => { const t = 夹((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const 时间预设 = [
      ["現在時間", null],
      ["清晨", (s) => s.日出 + 0.5],
      ["正午", (s) => (s.日出 + s.日落) / 2],
      ["黃昏", (s) => s.日落 - 0.3],
      ["夜晚", (s) => s.日落 + 3.5]
    ];
    let 时间档 = 0;
    const 参数小时 = parseFloat(new URLSearchParams(location.search).get("hour"));
    function 当前小时() {
      const 预设 = 时间预设[时间档][1];
      if (预设) return 预设(日照);
      if (!isNaN(参数小时)) return 参数小时;
      const d = new Date();
      return (d.getUTCHours() + 8) % 24 + d.getUTCMinutes() / 60;
    }
    let 夜光 = 0;
    function 更新天空(秒) {
      const h = 当前小时(), 日长 = 日照.日落 - 日照.日出;
      let 相位;
      if (h >= 日照.日出 && h <= 日照.日落) 相位 = (h - 日照.日出) / 日长;
      else 相位 = 1 + ((h > 日照.日落 ? h - 日照.日落 : h + 24 - 日照.日落) / (24 - 日长));
      const 角 = 相位 * Math.PI;
      太阳向.set(-Math.cos(角) * 0.9, Math.sin(角), 0.45).normalize();
      const y = 太阳向.y, 日光量 = 平滑步(-0.05, 0.3, y);
      夜光 = 平滑步(0.12, -0.12, y);
      const u = 天空参数.uniforms;
      u.uSunHeight.value = y; u.uSunDir.value.copy(太阳向); u.uTime.value = 秒;
      u.uTwilight.value = Math.exp(-Math.pow(y / 0.22, 2)); u.uNight.value = 平滑步(0.05, -0.2, y);
      阳光.position.copy(太阳向).multiplyScalar(34);
      阳光.intensity = 2.0 * 日光量; 阳光.color.copy(色.暖).lerp(色.白, 平滑步(0, 0.45, y));
      月光.position.copy(太阳向).multiplyScalar(-30); if (月光.position.y < 6) 月光.position.y = 6;
      月光.intensity = 0.38 * (1 - 日光量);
      环境光.intensity = 0.3 + 0.85 * 日光量;
      环境光.color.copy(色.夜天).lerp(色.日天, 日光量); 环境光.groundColor.copy(色.夜地).lerp(色.日地, 日光量);
      场景.fog.color.copy(色.雾夜).lerp(色.雾日, 日光量).lerp(色.雾暮, Math.exp(-Math.pow(y / 0.22, 2)) * 0.4);
      窗材质.emissiveIntensity = 1.3 * 夜光;
      灯发光材质.emissiveIntensity = 1.7 * 夜光;
    }

    // ================================================================
    //  裝飾品：程序化低多邊形，原點在底部中心
    // ================================================================
    const 装饰叶 = [0x5f7f55, 0x6f9060, 0x80a06c].map(c => 材质(c, 0.95));
    const 樱花叶 = [0xe8b9c2, 0xf0cdd6, 0xd99aab].map(c => 材质(c, 0.95));
    const 蘑菇帽材质 = 材质(0xc9574d, 0.8, { side: THREE.DoubleSide });
    const 蘑菇茎材质 = 材质(0xf0e6d2, 0.9);
    const 水材质 = 材质(0x6fa9bd, 0.15, { metalness: 0.1 });
    const 荷叶材质 = 材质(0x5f8a4f, 0.9);
    const 花瓣地材质 = 材质(0xf0cdd6, 1, { transparent: true, opacity: 0.6, depthWrite: false });
    const 灯发光材质 = 材质(0xf3dfae, 0.6, { emissive: 0xffb85c, emissiveIntensity: 0 });
    const 加 = (组, 几何, 材, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(几何, 材); m.position.set(x, y, z); 组.add(m); return m; };
    const 盒 = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const 柱 = (r1, r2, h, n = 6) => new THREE.CylinderGeometry(r1, r2, h, n);
    const 球 = (r, a = 8, b = 6) => new THREE.SphereGeometry(r, a, b);

    function 建野花丛() {
      const g = new THREE.Group();
      [[0, 0], [.18, .1], [-.15, .12], [.08, -.2], [-.1, -.16]].forEach(([x, z], i) => {
        const h = .22 + (i % 3) * .05;
        加(g, 柱(.012, .016, h, 4), 草丛材质组[0], x, h / 2, z);
        加(g, 球(.065, 7, 5), 花材质组[i % 3], x, h + .02, z).scale.set(1, .7, 1);
      });
      return g;
    }
    function 建蘑菇() {
      const g = new THREE.Group();
      [[0, 0, .2, .13], [.2, .08, .13, .09], [-.14, .16, .1, .07]].forEach(([x, z, h, r]) => {
        加(g, 柱(r * .35, r * .45, h), 蘑菇茎材质, x, h / 2, z);
        加(g, new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 蘑菇帽材质, x, h, z);
      });
      return g;
    }
    function 建灌木() {
      const g = new THREE.Group();
      [[0, .3, 0, .34], [.28, .24, .06, .26], [-.26, .22, -.04, .27], [.04, .2, .26, .24]].forEach(([x, y, z, r], i) => {
        加(g, 球(r, 9, 7), 装饰叶[i % 3], x, y, z).scale.y = .85;
      });
      return g;
    }
    function 建花圃() {
      const g = new THREE.Group(), w = 1.3, d = .9, h = .14;
      加(g, 盒(w, .1, d), 土材质, 0, .05, 0);
      [d / 2, -d / 2].forEach(z => 加(g, 盒(w + .1, h, .08), 木材质, 0, h / 2, z));
      [w / 2, -w / 2].forEach(x => 加(g, 盒(.08, h, d), 木材质, x, h / 2, 0));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = (i - 1) * .38, z = (j - 1) * .26, hh = .22 + ((i + j) % 3) * .06;
        加(g, 柱(.012, .016, hh, 4), 草丛材质组[1], x, .1 + hh / 2, z);
        加(g, 球(.07, 7, 5), 花材质组[(i * 3 + j) % 3], x, .1 + hh + .02, z).scale.set(1, .7, 1);
      }
      return g;
    }
    function 建长椅() {
      const g = new THREE.Group();
      加(g, 盒(1.1, .06, .38), 木亮材质, 0, .36, 0);
      加(g, 盒(1.1, .3, .05), 木亮材质, 0, .6, -.17).rotation.x = -.12;
      [[-.48, -.14], [.48, -.14], [-.48, .14], [.48, .14]].forEach(([x, z]) => 加(g, 盒(.06, .34, .06), 木材质, x, .17, z));
      return g;
    }
    function 建石灯笼() {
      const g = new THREE.Group(), s = 石材质组[1];
      加(g, 盒(.4, .08, .4), s, 0, .04, 0);
      加(g, 柱(.07, .09, .42), s, 0, .29, 0);
      加(g, 盒(.3, .05, .3), s, 0, .52, 0);
      加(g, 盒(.2, .22, .2), 灯发光材质, 0, .66, 0);
      加(g, new THREE.ConeGeometry(.28, .2, 4), s, 0, .88, 0).rotation.y = Math.PI / 4;
      return g;
    }
    function 建小树() {
      const g = new THREE.Group();
      加(g, 柱(.06, .1, .9), 木材质, 0, .45, 0);
      加(g, 球(.42, 9, 7), 装饰叶[1], 0, 1.1, 0);
      加(g, 球(.3, 9, 7), 装饰叶[2], .18, 1.45, .05);
      加(g, 球(.26, 9, 7), 装饰叶[0], -.2, .95, .1);
      return g;
    }
    function 建池塘() {
      const g = new THREE.Group();
      加(g, 柱(1.05, 1.1, .14, 24), 石材质组[0], 0, .07, 0);
      加(g, 柱(.9, .9, .05, 24), 水材质, 0, .13, 0);
      加(g, 柱(.16, .16, .02, 10), 荷叶材质, .3, .16, .15);
      加(g, 柱(.13, .13, .02, 10), 荷叶材质, -.25, .16, -.3);
      加(g, 球(.07, 7, 5), 花材质组[0], .3, .2, .15).scale.y = .8;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + .3;
        加(g, new THREE.DodecahedronGeometry(.13 + (i % 3) * .03, 0), 石材质组[i % 4], Math.cos(a) * 1.0, .1, Math.sin(a) * 1.0).scale.set(1.2, .7, 1);
      }
      return g;
    }
    function 建拱门() {
      const g = new THREE.Group(), w = .58;
      [-1, 1].forEach(s => 加(g, 盒(.1, 1.15, .1), 木亮材质, s * w, .575, 0));
      加(g, new THREE.TorusGeometry(w, .05, 6, 18, Math.PI), 木亮材质, 0, 1.15, 0);
      for (let i = 0; i <= 8; i++) {
        const a = i / 8 * Math.PI;
        加(g, 球(.07, 6, 5), 装饰叶[i % 3], Math.cos(a) * w, 1.15 + Math.sin(a) * w, 0).scale.set(1.2, 1, 1.2);
        if (i % 2 === 0) 加(g, 球(.05, 6, 5), 花材质组[i % 3], Math.cos(a) * w, 1.15 + Math.sin(a) * w + .04, .06);
      }
      [-1, 1].forEach(s => [.3, .6, .9].forEach((y, k) => 加(g, 球(.06, 6, 5), 装饰叶[k % 3], s * w, y, .03)));
      return g;
    }
    function 建樱花树() {
      const g = new THREE.Group();
      加(g, 柱(.09, .16, 1.5), 木材质, 0, .75, 0).rotation.z = .05;
      [[0, 1.9, 0, .7], [.5, 1.65, .15, .5], [-.45, 1.7, -.1, .55], [.1, 2.3, .1, .45], [-.1, 1.55, .5, .4]]
        .forEach(([x, y, z, r], i) => 加(g, 球(r, 10, 8), 樱花叶[i % 3], x, y, z));
      const 地 = 加(g, new THREE.CircleGeometry(.9, 18), 花瓣地材质, 0, .05, 0); 地.rotation.x = -Math.PI / 2; 地.userData.不投影 = true;
      return g;
    }
    function 建风车() {
      const g = new THREE.Group();
      加(g, 柱(.3, .46, 1.7, 8), 屋墙材质, 0, .85, 0);
      加(g, new THREE.ConeGeometry(.42, .55, 8), 屋顶材质[0], 0, 1.975, 0);
      加(g, 盒(.22, .4, .05), 木材质, 0, .2, .44);
      const 叶 = new THREE.Group(); 叶.position.set(0, 1.6, .4); g.add(叶);
      加(叶, 球(.07, 6, 5), 木材质);
      for (let i = 0; i < 4; i++) {
        const 臂 = new THREE.Group(); 臂.rotation.z = i * Math.PI / 2; 叶.add(臂);
        加(臂, 盒(.06, .95, .02), 木亮材质, 0, .5, 0);
        加(臂, 盒(.22, .6, .015), 屋墙材质, .12, .6, .02);
      }
      g.userData.更新 = (秒, dt) => { 叶.rotation.z -= dt * 0.9; };
      return g;
    }

    // 商品表（價格依「每顆種子 = 1 個花瓣、每日最多收 20 顆」的經濟調整：全部買齊約需 190 個花瓣）：名稱 / 圖示 / 價格 / 解鎖島嶼等級 / 佔地半徑 / 建造函式
    const 商品表 = {
      wildflower: { 名: "野花叢", 图: "🌼", 价: 2,   等级: 1, 半径: 0.4,  建: 建野花丛 },
      mushroom:   { 名: "蘑菇",   图: "🍄", 价: 3,  等级: 1, 半径: 0.35, 建: 建蘑菇 },
      bush:       { 名: "灌木",   图: "🌿", 价: 5,  等级: 1, 半径: 0.55, 建: 建灌木 },
      flowerbed:  { 名: "花圃",   图: "🌷", 价: 8,  等级: 1, 半径: 0.8,  建: 建花圃 },
      bench:      { 名: "長椅",   图: "🪑", 价: 12,  等级: 2, 半径: 0.65, 建: 建长椅 },
      sapling:    { 名: "小樹",   图: "🌳", 价: 13,  等级: 2, 半径: 0.6,  建: 建小树 },
      lantern:    { 名: "石燈籠", 图: "🏮", 价: 15,  等级: 2, 半径: 0.35, 建: 建石灯笼 },
      arch:       { 名: "花藤拱門", 图: "🌹", 价: 20, 等级: 3, 半径: 0.75, 建: 建拱门 },
      pond:       { 名: "蓮花池", 图: "💧", 价: 23,  等级: 3, 半径: 1.1,  建: 建池塘 },
      sakura:     { 名: "櫻花樹", 图: "🌸", 价: 35, 等级: 4, 半径: 1.0,  建: 建樱花树 },
      windmill:   { 名: "風車",   图: "🌾", 价: 55, 等级: 5, 半径: 0.9,  建: 建风车 }
    };
    const 固定障碍 = [{ x: 2, z: -2, r: 1.2 }, { x: -2, z: 2, r: 2.1 }];   // 大樹、房屋
    const 最大半径 = 7.1;                                                   // 草地可用半徑

    // ================================================================
    //  已擺放的裝飾
    // ================================================================
    const 摆设组 = new THREE.Group(); 岛屿.add(摆设组);
    const 已摆 = new Map();     // id -> { 数据, 网格, 出现 }
    function 开阴影(组, 开 = true) { 组.traverse(o => { if (o.isMesh) { o.castShadow = 开 && !o.userData.不投影; o.receiveShadow = 开; } }); }
    function 释放(obj, 含材质 = false) {
      obj.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (含材质 && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    }
    function 生成摆设(数据, 入场 = false) {
      const 目 = 商品表[数据.type]; if (!目) return;
      const 组 = 目.建(); 开阴影(组);
      组.position.set(数据.x, 地面Y, 数据.z); 组.rotation.y = 数据.rot; 组.userData.id = 数据.id;
      if (入场) 组.scale.setScalar(0.0001);
      摆设组.add(组);
      已摆.set(数据.id, { 数据, 网格: 组, 出现: 入场 ? performance.now() : 0 });
      刷新地被();
    }
    function 重建摆设() {
      for (const e of 已摆.values()) { 摆设组.remove(e.网格); 释放(e.网格); }
      已摆.clear();
      host.getDecor().forEach(d => 生成摆设(d));
    }
    function 刷新地被() {   // 裝飾下面的草與野花先藏起來，避免穿模
      for (const c of 地被列表) {
        let 显 = true;
        for (const e of 已摆.values()) {
          const d = e.数据;
          if (Math.hypot(c.x - d.x, c.z - d.z) < 商品表[d.type].半径 + 0.12) { 显 = false; break; }
        }
        c.网格.visible = 显;
      }
    }
    function 可放置(x, z, r, 忽略) {
      if (Math.hypot(x, z) + r > 最大半径) return false;
      for (const o of 固定障碍) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
      for (const [id, e] of 已摆) {
        if (id === 忽略) continue;
        if (Math.hypot(x - e.数据.x, z - e.数据.z) < 商品表[e.数据.type].半径 + r) return false;
      }
      return true;
    }
    function 找空位(x, z, r, 忽略) {
      if (可放置(x, z, r, 忽略)) return [x, z];
      for (let k = 1; k <= 16; k++) for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2 + k, nx = x + Math.cos(a) * k * 0.45, nz = z + Math.sin(a) * k * 0.45;
        if (可放置(nx, nz, r, 忽略)) return [nx, nz];
      }
      return [x, z];
    }

    // ================================================================
    //  擺放：射線 → 地面；幽靈預覽；選取 / 旋轉 / 移動 / 回收
    // ================================================================
    const 射线 = new THREE.Raycaster(), 鼠标 = new THREE.Vector2(), 地平面 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const 指示环 = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7bc47f, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    指示环.renderOrder = 10; 指示环.visible = false; 岛屿.add(指示环);

    let 模式 = "idle", 放置 = null, 选中 = null;
    function 设射线(cx, cy) {
      const r = 渲染器.domElement.getBoundingClientRect();
      鼠标.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      射线.setFromCamera(鼠标, 相机);
    }
    function 取地面点(cx, cy) {
      设射线(cx, cy);
      地平面.constant = -(地面Y + 岛屿.position.y);
      const p = new THREE.Vector3();
      return 射线.ray.intersectPlane(地平面, p) ? p : null;
    }
    function 幽灵化(组) {
      组.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.72; o.material.depthWrite = false;
        o.castShadow = false; o.receiveShadow = false;
      });
    }
    function 摆指示环(x, z, r, 有效) {
      指示环.visible = true; 指示环.position.set(x, 地面Y + 0.04, z); 指示环.scale.setScalar(r + 0.08);
      指示环.material.color.set(有效 ? 0x7bc47f : 0xd86a6a);
    }
    function 应用幽灵() {
      const 目 = 商品表[放置.类型], 最大 = 最大半径 - 目.半径, d = Math.hypot(放置.x, 放置.z);
      if (d > 最大) { 放置.x *= 最大 / d; 放置.z *= 最大 / d; }
      const 旧 = 放置.有效;
      放置.有效 = 可放置(放置.x, 放置.z, 目.半径, 放置.移动id);
      放置.组.position.set(放置.x, 地面Y, 放置.z); 放置.组.rotation.y = 放置.rot;
      摆指示环(放置.x, 放置.z, 目.半径, 放置.有效);
      if (旧 !== 放置.有效) 渲染操作条();
    }
    function 开始放置(类型, 移动id = null) {
      结束放置();
      const 目 = 商品表[类型], 组 = 目.建(); 幽灵化(组); 岛屿.add(组);
      let x = 0, z = 0, rot = 0;
      if (移动id !== null) {
        const e = 已摆.get(移动id); x = e.数据.x; z = e.数据.z; rot = e.数据.rot; e.网格.visible = false;
      } else {
        const 点 = 取地面点(innerWidth / 2, innerHeight * 0.45) || new THREE.Vector3(0, 0, 4);
        [x, z] = 找空位(点.x, 点.z, 目.半径, null);
      }
      放置 = { 类型, 移动id, x, z, rot, 组, 有效: false };
      应用幽灵(); 更新装饰面板();
    }
    function 结束放置() {
      if (!放置) return;
      岛屿.remove(放置.组); 释放(放置.组, true);
      if (放置.移动id !== null) { const e = 已摆.get(放置.移动id); if (e) e.网格.visible = true; }
      放置 = null; 指示环.visible = false;
    }
    function 确认放置() {
      if (!放置 || !放置.有效) return;
      const 目 = 商品表[放置.类型];
      if (放置.移动id !== null) {
        const e = 已摆.get(放置.移动id);
        e.数据.x = 放置.x; e.数据.z = 放置.z; e.数据.rot = 放置.rot;
        e.网格.position.set(放置.x, 地面Y, 放置.z); e.网格.rotation.y = 放置.rot;
        host.updateDecor(放置.移动id, { x: e.数据.x, z: e.数据.z, rot: e.数据.rot });
        结束放置(); 刷新地被(); 更新装饰面板(); return;
      }
      if (!host.spend(目.价)) { 吐司(货币 + "不足"); return; }
      const 数据 = host.addDecor({ type: 放置.类型, x: +放置.x.toFixed(3), z: +放置.z.toFixed(3), rot: 放置.rot });
      生成摆设(数据, true);
      结束放置(); 刷新(); 更新装饰面板();
    }
    function 选择(id) {
      选中 = id; const e = 已摆.get(id), 目 = 商品表[e.数据.type];
      摆指示环(e.数据.x, e.数据.z, 目.半径, true); 更新装饰面板();
    }
    function 取消选中() { 选中 = null; if (!放置) 指示环.visible = false; }
    function 回收(id) {
      const e = 已摆.get(id), 退 = Math.floor(商品表[e.数据.type].价 * 0.5);
      摆设组.remove(e.网格); 释放(e.网格); 已摆.delete(id);
      host.removeDecor(id); host.refund(退);
      取消选中(); 刷新地被(); 刷新();
      吐司(`已回收，退回 ${货币} ${退}`); 更新装饰面板();
    }
    function 渲染操作条() {
      const 条 = $("操作条"); 条.innerHTML = "";
      const 钮 = (文, fn, 禁用 = false, 类 = "") => { const b = document.createElement("button"); b.type = "button"; b.textContent = 文; b.disabled = 禁用; if (类) b.className = 类; b.onclick = fn; 条.appendChild(b); };
      if (放置) {
        const 目 = 商品表[放置.类型], 免费 = 放置.移动id !== null;
        钮("取消", () => { 结束放置(); 更新装饰面板(); });
        钮("↻ 旋轉", () => { 放置.rot += Math.PI / 4; 应用幽灵(); });
        钮(放置.有效 ? (免费 ? "✓ 放在這裡" : `✓ 放置 · 詞露 ${目.价}`) : "此處無法放置", 确认放置, !放置.有效, "isl-primary");
        条.hidden = false;
      } else if (选中 !== null && 已摆.has(选中)) {
        const e = 已摆.get(选中), 退 = Math.floor(商品表[e.数据.type].价 * 0.5);
        钮("↻ 旋轉", () => { e.数据.rot += Math.PI / 4; e.网格.rotation.y = e.数据.rot; host.updateDecor(e.数据.id, { rot: e.数据.rot }); });
        钮("↔ 移動", () => { const id = 选中; 取消选中(); 开始放置(e.数据.type, id); });
        钮(`♻ 回收 +${退}`, () => 回收(选中));
        钮("完成", () => { 取消选中(); 更新装饰面板(); }, false, "isl-primary");
        条.hidden = false;
      } else 条.hidden = true;
    }
    // 點按（不是拖曳）才算操作，避免和 OrbitControls 旋轉打架
    let 按下 = null;
    const 画布 = 渲染器.domElement;
    画布.addEventListener("pointerdown", e => { 按下 = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    画布.addEventListener("pointerup", e => {
      if (!按下) return;
      const 动 = Math.hypot(e.clientX - 按下.x, e.clientY - 按下.y), 久 = performance.now() - 按下.t; 按下 = null;
      if (动 > 7 || 久 > 450) return;
      if (模式 === "idle") { 设模式("decor"); return; }
      if (模式 !== "decor") return;
      if (放置) { const 点 = 取地面点(e.clientX, e.clientY); if (点) { 放置.x = 点.x; 放置.z = 点.z; 应用幽灵(); } return; }
      设射线(e.clientX, e.clientY);
      const 命中 = 射线.intersectObjects(摆设组.children, true)[0];
      if (命中) { let o = 命中.object; while (o.parent && o.parent !== 摆设组) o = o.parent; if (o.userData.id !== undefined) { 选择(o.userData.id); return; } }
      取消选中(); 更新装饰面板();
    });
    画布.addEventListener("pointermove", e => {
      if (模式 !== "decor" || !放置 || 按下 || e.pointerType !== "mouse") return;
      const 点 = 取地面点(e.clientX, e.clientY); if (点) { 放置.x = 点.x; 放置.z = 点.z; 应用幽灵(); }
    });


    // ================================================================
    //  介面與資料同步（所有資料都從 host 讀、往 host 寫）
    // ================================================================
    let 吐司计时;
    function 吐司(文字) {
      const t = $("吐司"); t.textContent = 文字; t.classList.add("isl-on");
      clearTimeout(吐司计时); 吐司计时 = setTimeout(() => t.classList.remove("isl-on"), 2800);
    }
    let 成长 = host.getGrowthInfo();
    const 当前等级 = () => 成长.level;
    const 树目标进度 = () => 成长.progress;
    const 阶段文字 = ["小苗正在長大", "小樹慢慢抽高", "枝葉越來越茂盛", "花園快要盛開了", "花園繁盛"];
    let 商店收起 = false, 显示币 = null;

    function 渲染商店() {
      const 架 = $("货架"), lv = 当前等级(), 币 = host.getTokens(); 架.innerHTML = "";
      Object.entries(商品表).forEach(([类型, 目]) => {
        const b = document.createElement("button"); b.type = "button";
        b.className = "isl-item" + (lv < 目.等级 ? " isl-lock" : 币 < 目.价 ? " isl-poor" : "");
        b.innerHTML = `<span class="isl-ico">${目.图}</span>${目.名}<small>${lv < 目.等级 ? "🔒 Lv." + 目.等级 : 货币 + " " + 目.价}</small>`;
        b.onclick = () => {
          if (lv < 目.等级) return 吐司(`花園 Lv.${目.等级} 解鎖「${目.名}」`);
          if (币 < 目.价) return 吐司(`${货币}還差 ${目.价 - 币}，去學單字、收取種子吧`);
          开始放置(类型);
        };
        架.appendChild(b);
      });
    }
    function 刷新() {
      成长 = host.getGrowthInfo();
      const 收 = host.getHarvestInfo(), 币 = host.getTokens();
      const 上 = 成长.stageTo, 比 = 上 == null ? 100 : 100 * (成长.growth - 成长.stageFrom) / (上 - 成长.stageFrom);
      $("级别").textContent = "Lv." + 成长.level;
      $("经验条").style.width = Math.max(0, Math.min(100, 比)) + "%";
      $("花园大").textContent = 上 == null ? `成長 ${成长.growth}（已滿級）` : `成長 ${成长.growth} / ${上}`;
      $("花园副").textContent = 阶段文字[Math.min(成长.stage, 阶段文字.length - 1)] + (收.pending ? `　·　${收.pending} 顆種子待收` : "");
      for (const id of ["收取", "收取2"]) {
        const b = $(id); b.hidden = !收.harvestable;
        b.textContent = `🌱 收取 ${收.harvestable} 顆種子`;
      }
      $("商店代币").textContent = 币;
      渲染商店();
    }
    function 收取() {
      const n = host.harvest();
      if (!n) return 吐司(host.getHarvestInfo().pending ? "今日收取已達上限，明天再來" : "目前沒有可收取的種子，先去學單字吧");
      吐司(`收取了 ${n} 顆種子　成長 +${n}　${货币} +${n}`); 刷新();
    }

    const 岛容器 = $("岛屿容器"), 卡 = $("花园卡");
    const 初始距离 = Math.hypot(初始相机.x, 初始相机.y - 2.4, 初始相机.z);
    function 调整尺寸() {
      const w = 岛容器.clientWidth || 360, h = 岛容器.clientHeight || 400, a = w / h;
      渲染器.setSize(w, h, false);
      相机.aspect = a;
      相机.fov = Math.max(39, 2 * Math.atan(24 / a / 2 / 初始距离) * 180 / Math.PI);   // 直向手機自動拉大視角
      相机.updateProjectionMatrix();
    }
    const 尺寸观察 = new ResizeObserver(调整尺寸); 尺寸观察.observe(岛容器);

    function 进入花园界面() {
      卡.classList.add("isl-full"); document.body.style.overflow = "hidden";
      $("全屏条").hidden = false; 商店收起 = false;
      控制器.enabled = true; 控制器.autoRotate = false; 渲染器.domElement.style.touchAction = "none";
      调整尺寸(); if (onFullscreenChange) onFullscreenChange(true);
    }
    function 退出花园界面() {
      结束放置(); 取消选中();
      卡.classList.remove("isl-full"); document.body.style.overflow = "";
      $("全屏条").hidden = true; $("开商店").hidden = true; $("商店面板").hidden = true; $("操作条").hidden = true;
      控制器.enabled = false; 控制器.autoRotate = true; 渲染器.domElement.style.touchAction = "pan-y";
      相机.position.copy(初始相机); 控制器.target.set(0, 2.4, 0); 调整尺寸();
      if (onFullscreenChange) onFullscreenChange(false);
    }
    function 更新装饰面板() {
      const 空闲 = 模式 === "decor" && !放置 && 选中 === null;
      $("商店面板").hidden = !(空闲 && !商店收起);
      $("开商店").hidden = !(空闲 && 商店收起);
      渲染操作条();
    }
    function 设模式(m) {
      if (模式 === m) return;
      const 之前 = 模式; 模式 = m;
      if (之前 === "decor") 退出花园界面();
      if (m === "decor") 进入花园界面();
      更新装饰面板();
    }
    $("去花园").onclick = () => 设模式("decor");
    $("返回").onclick = () => 设模式("idle");
    $("关商店").onclick = () => { 商店收起 = true; 更新装饰面板(); };
    $("开商店").onclick = () => { 商店收起 = false; 更新装饰面板(); };
    $("收取").onclick = 收取; $("收取2").onclick = 收取;
    $("昼夜").onclick = () => { 时间档 = (时间档 + 1) % 时间预设.length; $("昼夜").textContent = 时间预设[时间档][0]; };
    let 复位动画 = null;
    $("复位").onclick = () => { 复位动画 = { t: 0, 从: 相机.position.clone(), 目: 控制器.target.clone() }; };
    const 取消订阅 = host.subscribe(刷新);

    // 載入：樹直接長到存檔大小，之後收取種子時才緩緩長高
    树状态.进度 = 树目标进度();
    重建摆设(); 刷新(); 调整尺寸();

    let 上帧 = performance.now(), 帧id = 0, 已销毁 = false, 可见 = true;
    const 可见观察 = typeof IntersectionObserver === "function" ? new IntersectionObserver(es => { 可见 = es[0].isIntersecting; }) : null;
    if (可见观察) 可见观察.observe(slot);
    function 帧() {
      if (已销毁) return;
      帧id = requestAnimationFrame(帧);
      const 现在 = performance.now(), dt = Math.min(0.1, (现在 - 上帧) / 1000), 秒 = 现在 / 1000; 上帧 = 现在;
      if (!可见 && 模式 === "idle") return;          // 捲出畫面外就不渲染，省電
      const 目标 = 树目标进度();
      if (目标 > 树状态.进度) 树状态.进度 = Math.min(目标, 树状态.进度 + Math.max(dt * (目标 - 树状态.进度) * 0.8, dt * 0.004));
      更新树生长();
      更新天空(秒);
      岛屿.position.y = Math.sin(秒 * 0.6) * 0.12;
      for (const e of 已摆.values()) {
        if (e.出现) { const k = (现在 - e.出现) / 550; if (k >= 1) { e.出现 = 0; e.网格.scale.setScalar(1); } else e.网格.scale.setScalar(Math.max(0.0001, 回弹(k))); }
        if (e.网格.userData.更新) e.网格.userData.更新(秒, dt);
      }
      if (模式 === "decor") { const 币 = host.getTokens(); if (币 !== 显示币) { 显示币 = 币; $("代币数2").textContent = 币; } }
      if (复位动画) {
        复位动画.t += dt / 0.9; const k = 平滑(复位动画.t);
        相机.position.lerpVectors(复位动画.从, 初始相机, k); 控制器.target.lerpVectors(复位动画.目, new THREE.Vector3(0, 2.4, 0), k);
        if (复位动画.t >= 1) 复位动画 = null;
      }
      控制器.update();
      渲染器.render(场景, 相机);
    }
    帧();

    return {
      refresh: 刷新,
      enter: () => 设模式("decor"),
      exit: () => 设模式("idle"),
      dispose() {
        已销毁 = true; cancelAnimationFrame(帧id); 尺寸观察.disconnect(); if (可见观察) 可见观察.disconnect(); 取消订阅(); clearTimeout(吐司计时);
        if (模式 === "decor") document.body.style.overflow = "";
        for (const e of 已摆.values()) 释放(e.网格);
        释放(场景, true); 渲染器.dispose(); if (渲染器.forceContextLoss) 渲染器.forceContextLoss();
        ui.remove(); slot.innerHTML = ""; slot.classList.remove('isl-slot');
        if (onFullscreenChange && 模式 === "decor") onFullscreenChange(false);
      }
    };
}
