/**
 * 二次元鼠标拖尾粒子效果
 * 粉蓝渐变粒子 + 星星闪烁
 */

const COLORS = ['#fb7299', '#ff9ab5', '#00a1d6', '#73d8ff', '#ffd700', '#ff69b4']
const PARTICLE_COUNT = 3  // 每次移动生成粒子数

interface Particle {
  x: number
  y: number
  size: number
  color: string
  alpha: number
  vx: number
  vy: number
  life: number
  maxLife: number
  type: 'circle' | 'star'
}

export function initCursorTrail() {
  const canvas = document.createElement('canvas')
  canvas.id = 'cursor-trail'
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:90;pointer-events:none;'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')!
  const particles: Particle[] = []
  let mouseX = 0, mouseY = 0
  let animId = 0

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX
    mouseY = e.clientY
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      spawn(mouseX, mouseY)
    }
  })

  // 点击时爆发更多粒子
  document.addEventListener('click', (e) => {
    for (let i = 0; i < 12; i++) {
      spawn(e.clientX, e.clientY, true)
    }
  })

  function spawn(x: number, y: number, burst = false) {
    const angle = Math.random() * Math.PI * 2
    const speed = burst ? Math.random() * 3 + 1 : Math.random() * 1.5 + 0.3
    const life = burst ? 40 + Math.random() * 30 : 20 + Math.random() * 20
    particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      size: burst ? Math.random() * 5 + 3 : Math.random() * 3 + 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (burst ? 1 : 0.5),
      life,
      maxLife: life,
      type: Math.random() > 0.6 ? 'star' : 'circle',
    })
  }

  function drawStar(cx: number, cy: number, size: number) {
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2
      const method = i === 0 ? 'moveTo' : 'lineTo'
      ctx[method](cx + Math.cos(angle) * size, cy + Math.sin(angle) * size)
    }
    ctx.closePath()
    ctx.fill()
  }

  function animate() {
    animId = requestAnimationFrame(animate)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.02 // 微弱重力
      p.life--
      p.alpha = p.life / p.maxLife

      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color
      // 发光效果
      ctx.shadowColor = p.color
      ctx.shadowBlur = p.size * 2

      if (p.type === 'star') {
        drawStar(p.x, p.y, p.size * 0.7)
      } else {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      if (p.life <= 0) {
        particles.splice(i, 1)
      }
    }
  }

  animate()

  // 返回清理函数
  return () => {
    cancelAnimationFrame(animId)
    canvas.remove()
  }
}
