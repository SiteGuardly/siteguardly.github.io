/* Orbit Arcade — a small, dependency-free perspective renderer. */
(function () {
  'use strict';

  const colorways = ['#d6ff40', '#fc5aaf', '#ffbe45'];
  const PI = Math.PI;
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  const mix = (a, b, t) => a + (b - a) * t;

  function init(canvas, options = {}) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return { setMode() {}, rotate() {}, refresh() {}, destroy() {} };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const faces = [];
    const anchors = [[-3.05, 2.95, 1.18], [1.4, 3.01, -0.55], [3.86, 1.73, 2.08]];
    const projectedAnchors = [];
    const palette = new Map();
    let width = 0, height = 0, dpr = 1, mode = 0;
    let angle = 0.36, goal = angle, pitch = .45, targetPitch = pitch;
    let aiming = [0, .35, .15], visible = true, frame = 0, lastTime = 0, zoom = 1;
    let turn = null, destroyed = false, layer = 0;
    let cx, cy, focal, camera, edge, up, ahead;

    const subtract = (a, b) => a.map((v, i) => v - b[i]);
    const sum = (a, b) => a.map((v, i) => v + b[i]);
    const scale = (a, b) => a.map(v => v * b);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = v => scale(v, 1 / (Math.hypot(...v) || 1));
    const center = points => scale(points.reduce(sum, [0, 0, 0]), 1 / points.length);

    function tint(color, amount) {
      const key = `${color}:${amount}`;
      if (!palette.has(key)) {
        const value = parseInt(color.slice(1), 16);
        const rgb = [value >> 16, (value >> 8) & 255, value & 255];
        palette.set(key, '#' + rgb.map(c => clamp(Math.round(amount < 1 ? c * amount : mix(c, 255, amount - 1)), 0, 255).toString(16).padStart(2, '0')).join(''));
      }
      return palette.get(key);
    }

    function face(points, fill, settings = {}) {
      const normal = cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
      faces.push({ points, fill, normal, center: center(points), layer, ...settings });
    }

    function box(x, y, z, w, h, d, color, settings = {}) {
      const { yaw = 0, shade = 1, top, front, texture, double } = settings;
      const a = w / 2, b = d / 2, sine = Math.sin(yaw), cosine = Math.cos(yaw);
      const p = (i, j, k) => [x + i * cosine + k * sine, y + j, z + k * cosine - i * sine];
      const v = [p(-a, 0, -b), p(a, 0, -b), p(a, h, -b), p(-a, h, -b), p(-a, 0, b), p(a, 0, b), p(a, h, b), p(-a, h, b)];
      const f = (ids, fill, extra) => face(ids.map(i => v[i]), fill, extra);
      f([4, 5, 6, 7], front || tint(color, .93 * shade), { texture, double });
      f([5, 1, 2, 6], tint(color, .72 * shade));
      f([1, 0, 3, 2], tint(color, .74 * shade), { texture: double ? texture : undefined });
      f([0, 4, 7, 3], tint(color, .83 * shade));
      f([7, 6, 2, 3], top || tint(color, 1.08 * shade));
      f([0, 1, 5, 4], tint(color, .54 * shade));
    }

    function hex(x, y, z, r, h, side, top, n = 6, phase = 0) {
      const v = Array.from({ length: n }, (_, i) => {
        const a = phase + i * PI * 2 / n;
        return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
      });
      const t = v.map(p => [p[0], p[1] + h, p[2]]);
      face([...t].reverse(), top);
      face(v, tint(side, .55));
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        face([v[i], t[i], t[j], v[j]], tint(side, .68 + .32 * ((i * 3) % 7) / 6));
      }
    }

    function gem(x, y, z, r, h, topColor, bottomColor, sides = 6) {
      const flat = Array.from({ length: sides }, (_, i) => [x + r * Math.cos(i * 2 * PI / sides), y, z + r * Math.sin(i * 2 * PI / sides)]);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        face([flat[i], [x, y + h, z], flat[j]], tint(topColor, .73 + .31 * ((i * 3) % 7) / 6), { double: true });
        face([flat[j], [x, y - h * .65, z], flat[i]], tint(bottomColor, .58 + .45 * ((i * 3) % 7) / 6), { double: true });
      }
    }

    function patch(x, z, w, d, color, y = .035) {
      face([[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2],[x-w/2,y,z-d/2]], color);
    }

    function tree(x, z, size, y = .045, hue = '#8b63fb') {
      box(x, y, z, size*.2, size*.72, size*.2, '#332985');
      box(x, y+size*.44, z, size*.65, size*.47, size*.61, hue, {yaw: .22});
      box(x+.045, y+size*.85, z, size*.40, size*.33, size*.36, tint(hue,1.12), {yaw: -.16});
    }

    function robot(x, z, size, y, body, tintColor, yaw) {
      const add = (ox, oy, w, h, d, color, settings = {}) => box(x+ox*Math.cos(yaw), y+oy, z-ox*Math.sin(yaw), w, h, d, color, { yaw, ...settings });
      add(-size*.22, 0, size*.32, size*.30, size*.45, body);
      add(size*.22, 0, size*.32, size*.30, size*.45, body);
      add(0, size*.25, size*.71, size*.47, size*.43, body);
      add(-size*.49, size*.26, size*.2, size*.43, size*.26, tintColor);
      add(size*.49, size*.26, size*.2, size*.43, size*.26, tintColor);
      add(0, size*.73, size*.58, size*.50, size*.50, tintColor, { texture: 'eyes' });
    }

    function build() {
      // The game map is an exploded cartridge with chunky, bevelled platforms.
      box(0,-1.34,.14,7.84,.45,5.14,'#362277',{top:'#533bbd'});
      box(0,-.89,.14,8.66,.47,5.74,'#4c34ac',{top:'#6545cc'});
      box(0,-.42,.14,9.05,.42,6.03,'#6350df',{front:'#4138aa',top:'#7768ed'});
      box(-1.95,-1.67,1.23,2.62,.34,2.55,'#32206c');
      box(2.51,-1.62,-.50,2.03,.27,1.72,'#4a2b96');
      box(-3.69,-.93,2.74,1.52,.39,1.28,'#4e38ad');
      box(-3.78,-.48,2.84,1.85,.49,1.42,'#6853e7',{top:'#8575f6'});
      box(3.73,-.83,2.38,1.75,.38,1.96,'#6550d2');
      box(4.02,-.41,2.55,1.41,.44,1.70,'#5d45d8',{top:'#8a76ff'});
      box(.65,-.40,-2.71,3.25,.43,1.0,'#6343d1',{top:'#9b73fc'});
      for (let i=0; i<5; i++) {
        box(-3.55+i*.38,-.95,3.145,.2,.105,.032, i % 2 ? '#f566b3' : '#e7ff65');
        box(1.16+i*.41,-.33,3.171,.29,.075,.032, i % 2 ? '#9a81ff' : '#bcacfb');
      }
      for (let i=0; i<4; i++) box(4.544,-.35,-1.69+i*.39,.028,.095,.26,'#a38eff');

      // Tiled promenades and stripes use flat faces, with no texture downloads.
      layer=1;
      for (let z=-2.42;z<3.0;z+=.38) for(let x=-4.20;x<4.35;x+=.38) {
        if ((z>-0.58 && z<1.25) || (x>-.87 && x<.85) || (x>2.55 && z>1.45)) {
          const cell = Math.round((x + z) / .38);
          patch(x,z,.37,.37,cell%2 ? '#5b4bd0' : '#6553dd');
        }
      }
      for(let i=0;i<10;i++) patch(-3.69+i*.79,.82,.43,.049,'#c0aaff', .065);
      for(let i=0;i<6;i++) patch(.02,-2.37+i*.42,.046,.23,'#c0aaff', .065);
      patch(2.08,1.75,2.55,.045,'#a394ff', .07);
      patch(2.08,2.22,2.55,.045,'#a394ff', .07);
      patch(-3.3,2.44,1.5,.45,'#4a35b1', .075);
      for(let i=0;i<5;i++) patch(-3.87+i*.27,2.44,.1,.41,'#aa92ff',.078);

      // Billboard with recognizable signage, lighting rails and inset screen.
      layer=2;
      box(-3.05,.015,.88,2.48,.23,1.74,'#aaa5ff',{top:'#beb0ff'});
      box(-3.05,.25,.86,2.1,.14,1.33,'#47359d',{top:'#5f45c3'});
      for (const x of [-3.77,-2.33]) {
        box(x,.33,.77,.19,1.84,.23,'#8d7cff');
        box(x,.37,1.02,.14,1.13,.075,'#d6ff40');
      }
      box(-3.05,1.43,.91,2.86,1.54,.54,'#2b1c75',{top:'#7762ff'});
      box(-3.05,1.53,1.19,2.63,1.36,.06,'#ac91ff',{front:'#a982fc'});
      box(-3.05,1.62,1.23,2.46,1.18,.045,'#1e126c',{texture:'billboard'});
      box(-3.05,2.87,1.27,2.80,.10,.10,'#d6ff40');
      for(let i=0;i<5;i++) box(-4.08+i*.51,1.50,1.29,.28,.039,.04,'#f4a4ff');
      box(-4.02,2.92,.76,.11,.36,.11,'#6df3ff');
      box(-3.88,2.92,.76,.11,.23,.11,'#f36af7');

      // Playable branded world: entrance, two frame layers and floating core.
      box(1.4,.04,-.95,3.16,.28,2.45,'#5440bb',{top:'#7161e8'});
      box(1.4,.33,-1.06,2.57,.16,1.8,'#b13fe1',{top:'#c06bf6'});
      box(1.4,.12,.32,2.20,.12,.48,'#b358e1',{top:'#f77ce0'});
      box(1.4,.24,.09,2.20,.12,.48,'#d75ade',{top:'#f77ce0'});
      for(const [i, x] of [.31,2.49].entries()) {
        box(x,.45,-.96,.46,1.90,.63,'#c847b6',{front:'#ff5ab8'});
        box(x,.54,-.58,.20,1.70,.08,'#ffacd7');
        box(x,.45,-1.25,.61,.24,.80,'#7d34b7');
        box(x,2.21,-.94,.60,.49,.74,'#ec51bf',{top:'#ff96db'});
        box(x,2.68,-.87,.23,.35,.27,'#a424b1');
        box(x+(i===0?-.34:.34),1.33,-.88,.30,.45,.45,'#7251d8');
      }
      box(1.4,2.34,-.96,2.26,.36,.72,'#e348c9',{top:'#ff85f2'});
      box(1.4,2.42,-.535,1.50,.17,.10,'#6d3ab6',{front:'#743ca9',texture:'portal'});
      box(1.4,2.71,-.98,1.05,.14,.49,'#9f47d1');
      face([[.60,.51,-1.1],[2.20,.51,-1.1],[2.20,2.33,-1.1],[.60,2.33,-1.1]],'#ae33c2',{texture:'energy',double:true});
      box(.54,.474,-.57,.11,1.79,.15,'#ff85da');
      box(2.26,.474,-.57,.11,1.79,.15,'#ff85da');
      box(1.4,2.25,-.57,1.77,.11,.15,'#ff85da');
      gem(1.40,1.43,-.48,.31,.47,'#f9d4ff','#9b69f7',4);
      for(let i=0;i<5;i++) gem(.68+i*.35,.54+i*.27,-.53,.038,.055,'#ffe0f8','#ff69df',4);

      // Promotion supply crate, landing pad and little collectible tokens.
      hex(3.81,0,1.89,1.34,.20,'#7749bd','#ae73ec',8,PI/8);
      hex(3.81,.2,1.89,1.01,.09,'#b975dd','#bf7aff',8,PI/8);
      hex(3.81,.29,1.89,.75,.06,'#b86cbe','#8149cb',8,PI/8);
      let gx = 3.81, gz = 1.89, by = .36;
      box(gx,by,gz,1.37,.83,1.07,'#e48831',{yaw:-.16,top:'#f9b953'});
      box(gx,by+.70,gz,1.48,.20,1.17,'#ffb742',{yaw:-.16,top:'#ffdc6f'});
      box(gx,by+.90,gz,.37,.064,1.15,'#fff0a0',{yaw:-.16});
      box(gx-.09,by+.06,gz+.57,.24,.73,.06,'#ffdf7f',{yaw:-.16});
      box(gx-.11,by+.33,gz+.61,.39,.30,.065,'#71349b',{yaw:-.16,texture:'lock'});
      box(gx-.05,by+.91,gz,.44,.15,.37,'#ffda61',{yaw:-.16});
      gem(gx+.03,1.58,gz,.18,.27,'#fff5ac','#ffac4d',5);
      for(const [x,y,z,r] of [[2.87,.67,2.72,.11],[4.49,.76,2.68,.13],[4.32,1.05,.98,.1],[2.90,.67,1.15,.085]]) gem(x,y,z,r,r*1.25,'#fff2a4','#ffad4f',5);

      // Rooftops, chunky props, game avatars and the floating landscape.
      for(const [x,z,s,h,c] of [[-3.77,-2.07,1.05,1.09,'#5e46c9'],[-2.87,-2.30,.60,.74,'#7961e6'],[-2.26,-2.22,.78,.91,'#49349c'],[3.66,-2.04,1.22,.84,'#7461df'],[4.06,-1.35,.58,.59,'#6246c8']]) {
        box(x,.04,z,s,h,s,c);
        box(x,.04+h,z,s*1.05,.11,s*1.05,tint(c,1.18));
        for(let i=0;i<3;i++) box(x+s*(i-1)*.25,.18+h*.35,z+s*.51,s*.13,h*.14,.023, i%2 ? '#e8a4ff' : '#a497ff');
      }
      for (const [x,z,s,c] of [[-4.11,-.92,.88,'#1cc9c7'],[-.79,-2.17,.74,'#3ae0da'],[3.74,-.65,.75,'#2bc3c9'],[-4.25,1.99,.62,'#d179f0'],[.11,2.83,.53,'#dc71ea'],[2.55,-2.22,.70,'#a66bf1']]) tree(x,z,s,.04,c);
      for (const [x,z,s,y,c,trim,yaw] of [[-1.41,1.62,.63,.04,'#523ec7','#e6ff63',.15],[.13,-1.32,.55,.045,'#6143ce','#66e7ee',-.45],[2.71,1.24,.61,.06,'#8728b9','#ffa4e9',.26],[-3.75,2.59,.66,.08,'#8a4bcf','#ff9cc0',-.14]]) robot(x,z,s,y,c,trim,yaw);
      for(const [x,z,qty,hue] of [[-1.47,-1.56,3,'#92deff'],[4.15,.06,3,'#c693ff'],[.65,2.43,2,'#feadf4']]) for(let i=0;i<qty;i++) box(x+i*.19,.04,z,.12,.23,.16,hue);
      for (const [x,y,z,r,h,c] of [[-4.77,-.56,1.29,.20,.33,'#f593ed'],[4.61,-.38,-.88,.17,.35,'#66e9f3'],[-3.66,-1.44,-2.54,.22,.29,'#a987fd'],[-1.68,-1.78,2.83,.18,.29,'#a685ff'],[4.26,-.19,3.49,.15,.31,'#ff9ce7'],[1.42,-1.68,2.91,.18,.23,'#ba8bff']]) gem(x,y,z,r,h,c,'#794dec',5);
      box(-5.02,.39,-1.37,.81,.27,.58,'#a898fa',{top:'#cbbcff'});
      box(-5.13,.67,-1.42,.48,.14,.40,'#b8a9fb');
      box(4.86,1.85,-2.24,.95,.16,.53,'#a08bf1',{top:'#ccbfff'});
      box(5.02,2.02,-2.25,.53,.15,.40,'#b9a5fb');
      box(-1.44,2.66,-2.1,.93,.16,.47,'#b5a1f5',{top:'#d7cbff'});
      box(-1.56,2.83,-2.13,.51,.15,.38,'#c7b8ff');
    }

    function project(p) {
      const v = subtract(p, camera), depth = dot(v, ahead), factor = focal / depth;
      return [cx + dot(v, edge) * factor, cy - dot(v, up) * factor, depth];
    }

    function trace(points) {
      ctx.beginPath();
      ctx.moveTo(points[0][0],points[0][1]);
      for (const p of points.slice(1)) ctx.lineTo(p[0],p[1]);
      ctx.closePath();
    }

    function texture(name, points, timestamp) {
      const p = points[3], q = points[2], r = points[0];
      const textureWidth = 300, textureHeight = 140;
      ctx.save();
      trace(points);
      ctx.clip();
      ctx.transform((q[0]-p[0])/textureWidth,(q[1]-p[1])/textureWidth,(r[0]-p[0])/textureHeight,(r[1]-p[1])/textureHeight,p[0],p[1]);

      if (name === 'billboard') {
        ctx.fillStyle = '#24136e';
        ctx.fillRect(0,0,300,140);
        ctx.fillStyle = '#d6ff40';
        ctx.fillRect(0,0,8,140);
        ctx.fillStyle = '#5d3cca';
        for(let i=0;i<9;i++) ctx.fillRect(195+i*12,6,3,130);
        ctx.fillStyle = '#b799ff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('IN-GAME MEDIA', 19, 26);
        ctx.fillStyle = '#f8efff';
        ctx.font = '900 44px system-ui';
        ctx.fillText('YOUR', 17, 69);
        ctx.fillStyle = '#d6ff40';
        ctx.fillText('BRAND', 17, 111);
        ctx.translate(248,72);
        ctx.rotate(.24);
        ctx.fillStyle = '#e2ff54';
        ctx.fillRect(-25,-25,50,50);
        ctx.rotate(-.53);
        ctx.fillStyle = '#5f39c6';
        ctx.fillRect(-11,-11,22,22);
      } else if (name === 'energy') {
        const glow = ctx.createLinearGradient(0,0,290,140);
        glow.addColorStop(0,'#361168');
        glow.addColorStop(.5,'#a530b7');
        glow.addColorStop(1,'#481383');
        ctx.fillStyle = glow;
        ctx.fillRect(0,0,300,140);
        ctx.strokeStyle = mode === 1 ? '#ff8ddd' : '#ed63cf';
        ctx.lineWidth = 1.25;
        for(let i=0;i<7;i++) {
          const inset = i * 10 + 5;
          ctx.strokeRect(inset,inset*.43,300-2*inset,140-inset*.86);
        }
        ctx.fillStyle = '#ffb5ed';
        for(let i=0;i<13;i++) ctx.fillRect((i*61)%293,((i*37+timestamp/90)%135),i%3+1,2);
      } else if (name === 'portal') {
        ctx.fillStyle = '#ffe3fd';
        ctx.textAlign = 'center';
        ctx.font = 'bold 66px monospace';
        ctx.fillText('PLAY WORLD',150,100);
      } else if (name === 'eyes') {
        ctx.fillStyle = '#251354';
        ctx.fillRect(49,51,202,69);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(85,69,34,29);
        ctx.fillRect(180,69,34,29);
      } else if(name === 'lock') {
        ctx.fillStyle = '#ffe68b';
        ctx.fillRect(119,49,62,58);
        ctx.strokeStyle = '#ffe68b';
        ctx.lineWidth = 8;
        ctx.strokeRect(130,29,40,29);
      }
      ctx.restore();
    }

    function scenery(timestamp) {
      const fade = ctx.createRadialGradient(width * .57, height * .47, 0,width * .57,height * .47,Math.max(width,height) * .52);
      fade.addColorStop(0,'rgba(125,91,255,.31)');
      fade.addColorStop(.71,'rgba(71,44,173,.13)');
      fade.addColorStop(1,'rgba(71,44,173,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0,0,width,height);
      ctx.save();
      ctx.translate(width*.53,height*.74);
      ctx.rotate(-.10);
      ctx.strokeStyle = 'rgba(174,149,255,.25)';
      ctx.lineWidth = .78;
      for(let i=0;i<3;i++) {
        ctx.beginPath();
        ctx.ellipse(0,0,width * (.29+i*.045),height * (.08+i*.037),0,0,PI*2);
        ctx.stroke();
      }
      ctx.restore();
      for(let i=0;i<33;i++) {
        const x = ((i*73+13)%317)/317*width, y = ((i*47+19)%263)/263*height;
        const size = (i%6===0) ? 2.6 : 1.15;
        ctx.fillStyle = `rgba(220,202,255,${.23+.25*(.5+.5*Math.sin(i+timestamp/1400))})`;
        ctx.fillRect(x,y,size,size);
      }
    }

    function pins(timestamp) {
      projectedAnchors.length=0;
      for(const [i, a] of anchors.entries()) {
        const p = project(a), x=p[0], y=p[1]-(media.matches ? 9 : 9+Math.sin(timestamp/510+i)*3);
        const size = mode === i ? 14 : 11;
        projectedAnchors.push([x,y]);
        ctx.beginPath();
        ctx.arc(x,y,size+4,0,2*PI);
        ctx.fillStyle = colorways[i]+'32';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x,y,size,0,2*PI);
        ctx.fillStyle = colorways[i];
        ctx.fill();
        ctx.strokeStyle='#28115f';
        ctx.lineWidth=1.4;
        ctx.stroke();
        ctx.fillStyle='#20124b';
        ctx.font='800 10px system-ui';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.fillText('0'+(i+1),x,y+.1);
      }
      ctx.textAlign='start';
      ctx.textBaseline='alphabetic';
    }

    function draw(timestamp) {
      frame = 0;
      if (!width || !height || !visible || destroyed) return;
      const moving = Math.abs(angle-goal)>.001 || Math.abs(pitch-targetPitch)>.001;
      if (!media.matches && !moving && timestamp-lastTime < 40) {
        frame=requestAnimationFrame(draw);
        return;
      }
      const time = media.matches ? 0 : timestamp;
      const elapsed = clamp(timestamp-lastTime, 8, 50);
      const easing = media.matches ? 1 : 1 - Math.pow(.88, elapsed / 16);
      lastTime = timestamp;
      angle = mix(angle,goal,easing);
      pitch = mix(pitch,targetPitch,easing);
      const target = [[0,.31,.13],[.21,.47,.07],[.28,.31,.28]][mode];
      aiming = aiming.map((v,i) => mix(v,target[i],easing));
      zoom = mix(zoom,[1,1.065,1.04][mode],easing);
      cx = width * .515;
      cy = height * .492;
      const radius = 18.0;
      focal = Math.min(width * 1.51, height * 1.84) * zoom;
      camera = sum(aiming,[Math.sin(angle)*Math.cos(pitch)*radius,Math.sin(pitch)*radius,Math.cos(angle)*Math.cos(pitch)*radius]);
      ahead = unit(subtract(aiming,camera));
      edge = unit(cross(ahead,[0,1,0]));
      up = cross(edge,ahead);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,width,height);
      scenery(time);

      const shown = faces.filter(f => f.double || dot(f.normal,subtract(camera,f.center)) > .001);
      for (const f of shown) f.depth=dot(subtract(f.center,camera),ahead);
      shown.sort((a,b) => a.layer-b.layer || b.depth-a.depth);
      for (const f of shown) {
        const points = f.points.map(project);
        trace(points);
        ctx.fillStyle = f.fill;
        ctx.fill();
        if (f.texture && (f.texture !== 'billboard' || dot(f.normal,subtract(camera,f.center)) > 0)) texture(f.texture,points,time);
      }
      pins(time);
      if (!media.matches && visible) frame=requestAnimationFrame(draw);
    }

    function request() {
      if(!frame && !destroyed && visible) frame=requestAnimationFrame(draw);
    }

    function refresh() {
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width); height = Math.round(rect.height);
      dpr = Math.min(devicePixelRatio || 1,1.65);
      if (width && height) {
        canvas.width = Math.round(width*dpr);
        canvas.height = Math.round(height*dpr);
        request();
      }
    }

    function setMode(index) {
      if (!Number.isInteger(index) || index < 0 || index > 2) return;
      mode=index;
      const angles=[.36,.13,-.30];
      goal=angles[index]; targetPitch=[.45,.41,.48][index];
      request();
    }

    function pointerStart(event) {
      if (event.button !== 0) return;
      turn={id:event.pointerId,x:event.clientX,y:event.clientY,goal,dragged:false};
      canvas.setPointerCapture(event.pointerId);
    }

    function pointerMove(event) {
      if (!turn || event.pointerId!==turn.id) return;
      const dx=event.clientX-turn.x;
      if (Math.abs(dx)>4) turn.dragged=true;
      if(turn.dragged) {
        goal=clamp(turn.goal+dx*.009,-1.15,1.18);
        request();
      }
    }

    function pointerEnd(event) {
      if (!turn || event.pointerId!==turn.id) return;
      if(event.type==='pointerup' && !turn.dragged && Math.abs(event.clientY-turn.y)<12) {
        const rect=canvas.getBoundingClientRect();
        const x=event.clientX-rect.left, y=event.clientY-rect.top;
        const i=projectedAnchors.findIndex(p => Math.hypot(p[0]-x,p[1]-y)<32);
        if (i>=0) {setMode(i); if (options.onPick) options.onPick(i);}
      }
      turn=null;
    }

    const resize = new ResizeObserver(refresh);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) request();
      else if(frame) {cancelAnimationFrame(frame);frame=0;}
    });
    canvas.style.touchAction='pan-y';
    canvas.addEventListener('pointerdown',pointerStart);
    canvas.addEventListener('pointermove',pointerMove);
    canvas.addEventListener('pointerup',pointerEnd);
    canvas.addEventListener('pointercancel',pointerEnd);
    media.addEventListener('change',request);
    resize.observe(canvas);
    observer.observe(canvas);
    build();
    refresh();
    return {
      setMode,
      rotate(delta) {goal=clamp(goal+delta,-1.15,1.18);request();},
      refresh,
      destroy() {
        destroyed=true;
        if(frame) cancelAnimationFrame(frame);
        resize.disconnect();
        observer.disconnect();
        canvas.removeEventListener('pointerdown',pointerStart);
        canvas.removeEventListener('pointermove',pointerMove);
        canvas.removeEventListener('pointerup',pointerEnd);
        canvas.removeEventListener('pointercancel',pointerEnd);
        media.removeEventListener('change',request);
      }
    };
  }

  window.OrbitScene = { init };
}());
