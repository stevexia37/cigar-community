<template>
  <div class="diagnostic w-full max-w-lg mx-auto">
    <div class="text-center mb-6">
      <div class="text-3xl mb-2">🔬</div>
      <h2 class="font-display text-cigar-gold text-xl">雪茄病害一键诊断</h2>
      <p class="text-cigar-mute text-xs mt-1">发现雪茄异常？三步诊断，秒出抢救方案</p>
    </div>

    <transition name="fade-slide" mode="out-in">
      <!-- Q1: 异常类型 -->
      <div v-if="q === 1" key="q1" class="space-y-3">
        <p class="text-cigar-cream text-sm font-medium text-center mb-4">你看到了什么？</p>
        <div class="grid grid-cols-2 gap-3">
          <button v-for="opt in q1Opts" :key="opt.value" @click="answer(1, opt.value)" :class="opt.color"
            class="p-4 rounded-xl border text-center transition-all duration-200 active:scale-95 hover:border-cigar-gold/50">
            <div class="text-2xl mb-1">{{ opt.icon }}</div>
            <div class="text-sm font-medium">{{ opt.label }}</div>
            <div class="text-[10px] opacity-60 mt-0.5">{{ opt.desc }}</div>
          </button>
        </div>
      </div>

      <!-- Q2: 细节 -->
      <div v-else-if="q === 2" key="q2" class="space-y-3">
        <p class="text-cigar-cream text-sm font-medium text-center mb-4">{{ q2Question }}</p>
        <div class="space-y-2">
          <button v-for="opt in q2Opts" :key="opt.value" @click="answer(2, opt.value)"
            class="w-full p-3 rounded-xl border border-cigar-light text-left transition-all duration-200 active:scale-95 hover:border-cigar-gold/50"
          >
            <div class="flex items-center gap-3">
              <span class="text-lg">{{ opt.icon }}</span>
              <div>
                <div class="text-sm font-medium text-cigar-cream">{{ opt.label }}</div>
                <div class="text-[11px] text-cigar-mute">{{ opt.desc }}</div>
              </div>
            </div>
          </button>
        </div>
        <button @click="q = 1" class="w-full py-2 text-sm text-cigar-mute hover:text-cigar-cream">重新选择</button>
      </div>

      <!-- Result -->
      <div v-else key="result" class="space-y-4">
        <!-- Diagnosis badge -->
        <div class="text-center">
          <div class="text-5xl mb-2">{{ result.icon }}</div>
          <h3 class="font-display text-xl" :class="result.color">{{ result.title }}</h3>
          <p class="text-cigar-mute text-xs mt-1">{{ result.subtitle }}</p>
        </div>

        <!-- Severity -->
        <div class="bg-cigar-dark rounded-xl p-4 border border-cigar-light">
          <div class="flex items-center justify-between mb-2">
            <span class="text-cigar-cream text-sm font-medium">严重等级</span>
            <span class="text-sm font-bold" :class="severityColor">{{ severityLabel }}</span>
          </div>
          <div class="w-full h-1.5 bg-cigar-light rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-700" :class="severityBarColor" :style="{ width: severityPct + '%' }"></div>
          </div>
        </div>

        <!-- Survival rate -->
        <div class="bg-cigar-dark rounded-xl p-4 border border-cigar-light text-center">
          <p class="text-cigar-mute text-xs mb-1">预估存活率</p>
          <p class="font-display text-3xl" :class="result.color">{{ result.survival }}%</p>
        </div>

        <!-- Rescue steps -->
        <div class="bg-cigar-dark rounded-xl p-4 border border-cigar-light">
          <h4 class="text-cigar-gold text-sm font-semibold mb-3">抢救步骤</h4>
          <div class="steps">
            <div v-for="(s, i) in result.steps" :key="i" class="step text-sm">
              <span class="text-cigar-gold font-bold">{{ i + 1 }}.</span>
              <span class="text-cigar-cream">{{ s }}</span>
            </div>
          </div>
        </div>

        <!-- Share button -->
        <button @click="shareResult"
          class="w-full py-3 rounded-xl bg-cigar-gold text-cigar-dark text-sm font-semibold hover:bg-cigar-gold/90 transition-all active:scale-95"
        >📸 生成诊断卡分享到群</button>

        <button @click="reset" class="w-full py-2 text-sm text-cigar-mute hover:text-cigar-cream transition-colors">重新诊断</button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const q = ref(1)
const answers = ref({})

const q1Opts = [
  { value:'mold', icon:'🦠', label:'白色/灰色毛状物', desc:'可能是发霉', color:'bg-cigar-dark border-cigar-light' },
  { value:'beetles', icon:'🐛', label:'小虫/粉末/虫眼', desc:'可能是雪茄虫', color:'bg-cigar-dark border-cigar-light' },
  { value:'dry', icon:'🌵', label:'茄衣开裂/干硬', desc:'可能是太干了', color:'bg-cigar-dark border-cigar-light' },
  { value:'plume', icon:'✨', label:'均匀结晶闪亮粉末', desc:'可能是起灰', color:'bg-cigar-dark border-cigar-light' },
]

const q2Question = computed(() => {
  const a = answers.value[1]
  const map = {
    mold: '霉菌分布在哪里？',
    beetles: '虫害严重程度？',
    dry: '干裂到什么程度？',
    plume: '确认以下特征：',
  }
  return map[a] || ''
})

const q2Opts = computed(() => {
  const a = answers.value[1]
  const opts = {
    mold: [
      { value:'mild', icon:'🔍', label:'零星小白点', desc:'直径<2mm，仅在表面1-2处' },
      { value:'moderate', icon:'⚠️', label:'片状灰白斑', desc:'覆盖面积<30%，未触及茄脚' },
      { value:'severe', icon:'🚨', label:'大面积覆盖', desc:'菌丝已侵入茄脚切口，有霉味' },
    ],
    beetles: [
      { value:'mild', icon:'🔍', label:'发现1-2只虫', desc:'雪茄表面无肉眼可见虫眼' },
      { value:'moderate', icon:'⚠️', label:'3-5只虫+针孔虫眼', desc:'个别雪茄有小洞' },
      { value:'severe', icon:'🚨', label:'大量虫+粉末碎屑', desc:'严重蔓延' },
    ],
    dry: [
      { value:'mild', icon:'🔍', label:'茄衣轻微起皱', desc:'湿度可能低于60%' },
      { value:'moderate', icon:'⚠️', label:'茄帽附近细微裂纹', desc:'湿度低于55%已持续数周' },
      { value:'severe', icon:'🚨', label:'茄衣大范围开裂', desc:'湿度低于50%，结构受损' },
    ],
    plume: [
      { value:'confirm', icon:'✅', label:'确认是结晶状不扩散', desc:'均匀分布、闪亮、无异味' },
    ],
  }
  return opts[a] || []
})

const result = computed(() => {
  const type = answers.value[1]
  const level = answers.value[2]

  const db = {
    mold: {
      mild: {
        icon:'🔬', title:'轻度霉菌', subtitle:'发现得早，很容易挽救',
        color:'text-yellow-400', survival:95,
        steps:[
          '用干净的超细纤维布轻轻擦拭霉点（一次性动作，不要来回摩擦）',
          '放入隔离密封袋（留1cm开口），湿度调至65% RH',
          '隔离观察2周，如无复发即可恢复正常养护',
          '检查同盒其他雪茄，一并隔离观察',
        ]
      },
      moderate: {
        icon:'⚠️', title:'中度霉菌', subtitle:'需要药物干涉，但大概率能救',
        color:'text-orange-400', survival:70,
        steps:[
          '准备食品级白兰地（40度，勿用威士忌）和医用棉签',
          '棉签蘸白兰地后挤至半干，以霉点为中心由内向外打圈擦拭',
          '每擦一次换一根新棉签，切勿重复使用',
          '擦拭后在通风暗处风干12-24小时',
          '用雪松木片包裹，湿度62-65%养护4周再抽吸',
        ]
      },
      severe: {
        icon:'🚨', title:'重度霉菌', subtitle:'有一定希望，但要有心理准备',
        color:'text-red-400', survival:40,
        steps:[
          '按中度霉菌步骤进行白兰地擦拭（全茄面处理）',
          '风干24小时后，检查茄脚切面是否有菌丝渗入',
          '如已渗入茄芯 → 不建议抽吸，考虑拆解保留烟叶做散装醇化实验',
          '如仅在表面 → 湿度降至62%养护8周',
          '无论如何，立刻清洁整个醇化柜（白醋擦拭内壁，暴晒木架）',
        ]
      },
    },
    beetles: {
      mild: {
        icon:'🐛', title:'一级虫害', subtitle:'单个虫害，能控制',
        color:'text-yellow-400', survival:90,
        steps:[
          '将受影响雪茄放入双层真空密封袋，排尽空气',
          '-18℃ 冷冻24小时 → 4℃ 冷藏24小时 → 室温回温24小时',
          '开封后检查是否还有活虫，重复一次冷冻流程（杀灭虫卵）',
          '2周后再抽吸，并隔离观察其余雪茄',
        ]
      },
      moderate: {
        icon:'⚠️', title:'二级虫害', subtitle:'蔓延风险高，尽快处理',
        color:'text-orange-400', survival:60,
        steps:[
          '将有虫眼的雪茄单独挑出（虫眼意味着内部已有隧道）',
          '所有同盒雪茄按一级虫害方案冷冻（-18℃ 48h + 冷藏24h + 回温48h）',
          '清洁所有养护盒和白松木片（白醋+暴晒）',
          '一个月后重复一次冷冻流程',
          '严重虫眼的雪茄不建议抽吸',
        ]
      },
      severe: {
        icon:'🚨', title:'三级虫害', subtitle:'整盒报废风险极高',
        color:'text-red-400', survival:10,
        steps:[
          '将虫蛀严重的雪茄直接丢弃（用密封袋扎紧再扔，防止虫卵扩散）',
          '未被虫蛀的雪茄按二级虫害方案处理（双倍冷冻时间）',
          '彻底清洁所有养护设备，必要时更换雪松木内衬',
          '全柜降温至16℃，降湿至62%，持续观察3个月',
        ]
      },
    },
    dry: {
      mild: {
        icon:'🌵', title:'轻度干旱', subtitle:'补水即可恢复',
        color:'text-yellow-400', survival:95,
        steps:[
          '将湿度缓慢提升至68% RH（用Boveda 69%包，切勿直接喷水）',
          '至少养护2周，让烟叶自然吸收水分',
          '如果茄衣依然有弹性，可以逐渐恢复正常吸食',
          '切勿直接将干雪茄放入高湿环境（茄衣会因吸水过快而爆裂）',
        ]
      },
      moderate: {
        icon:'⚠️', title:'中度干旱', subtitle:'需要长期恢复',
        color:'text-orange-400', survival:75,
        steps:[
          '将雪茄放入密封袋，同时放入Boveda 72%包，封袋养护',
          '每周检查一次：如果茄衣恢复弹性，转回68%进一步养护',
          '整个过程需要4-8周，不要着急',
          '严重裂纹处可以用少量雪茄胶（Cigar Glue）修补',
        ]
      },
      severe: {
        icon:'🚨', title:'重度干旱', subtitle:'结构已受损',
        color:'text-red-400', survival:30,
        steps:[
          '将湿度梯度提升法：先放62%包 × 1周 → 65%包 × 2周 → 68%包 × 4周',
          '茄衣大范围开裂建议拆解后用于填充或做雪茄烟斗丝',
          '养护环境温度控制在16-18℃，减缓水分蒸发速度',
          '已开裂的雪茄即使恢复也不建议长期陈化',
        ]
      },
    },
    plume: {
      confirm: {
        icon:'✨', title:'真正起灰（Plume）', subtitle:'恭喜！这是雪茄完美醇化的标志',
        color:'text-green-400', survival:100,
        steps:[
          'Plume 不需要任何处理，正常养护即可',
          '用软毛刷轻轻拂去表面结晶即可品吸',
          '这是烟叶油脂自然析出的结晶，是好雪茄的陈年证明',
          '请拍照上传到社区「开花猎人」板块，可申请特殊勋章',
        ]
      },
    },
  }

  return db[type]?.[level] || { icon:'❓', title:'无法判断', subtitle:'请重试或咨询社区专家', color:'text-cigar-mute', survival:0, steps:['建议在社区发帖求助，附上清晰照片'] }
})

const severityLabel = computed(() => {
  const lv = answers.value[2]
  const map = { mild:'轻度', moderate:'中度', severe:'重度', confirm:'安全' }
  return map[lv] || '未知'
})

const severityColor = computed(() => {
  const lv = answers.value[2]
  const map = { mild:'text-yellow-400', moderate:'text-orange-400', severe:'text-red-400', confirm:'text-green-400' }
  return map[lv] || 'text-cigar-mute'
})

const severityPct = computed(() => {
  const lv = answers.value[2]
  const map = { mild:25, moderate:55, severe:90, confirm:5 }
  return map[lv] || 0
})

const severityBarColor = computed(() => {
  const lv = answers.value[2]
  const map = { mild:'bg-yellow-400', moderate:'bg-orange-400', severe:'bg-red-400', confirm:'bg-green-400' }
  return map[lv] || 'bg-cigar-mute'
})

function answer(num, val) {
  answers.value[num] = val
  if (num === 1) q.value = 2
  else if (num === 2) q.value = 3
}

function shareResult() {
  alert('分享功能：生成长图诊断卡 → 保存/分享到群')
}

function reset() {
  q.value = 1
  answers.value = {}
}
</script>

<style scoped>
.diagnostic input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 999px;
  outline: none;
}
.diagnostic input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #c9a84c;
  cursor: pointer;
  border: 2px solid #1a1410;
}

.steps .step {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(61,52,40,0.3);
}
.steps .step:last-child {
  border-bottom: none;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>
