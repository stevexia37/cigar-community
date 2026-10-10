<template>
  <div class="submission-form w-full max-w-lg mx-auto">
    <!-- Header -->
    <div class="text-center mb-6">
      <div class="text-3xl mb-2">📝</div>
      <h2 class="font-display text-cigar-gold text-xl">数据库共建</h2>
      <p class="text-cigar-mute text-xs mt-1">库里没有你今天抽的茄？提交数据，永久署名</p>
    </div>

    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-2 mb-6">
      <div v-for="s in 3" :key="s" class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
          :class="step >= s ? 'bg-cigar-gold text-cigar-dark' : 'bg-cigar-light text-cigar-mute'"
        >{{ s }}</div>
        <span v-if="s < 3" class="w-6 h-px" :class="step > s ? 'bg-cigar-gold' : 'bg-cigar-light'"></span>
      </div>
    </div>

    <!-- Step 1: Basic Info -->
    <transition name="fade-slide" mode="out-in">
      <div v-if="step === 1" key="s1" class="space-y-3">
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">品牌 <span class="text-red-400">*</span></label>
          <input v-model="form.brand" placeholder="如 Cohiba"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">系列 / Line</label>
          <input v-model="form.line" placeholder="如 Línea Clásica"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">型号 / Vitola <span class="text-red-400">*</span></label>
          <input v-model="form.vitola" placeholder="如 Robusto"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-cigar-cream text-xs font-medium mb-1.5">长度（英寸）</label>
            <input v-model="form.length" type="number" step="0.1" placeholder="5.0"
              class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
          </div>
          <div>
            <label class="block text-cigar-cream text-xs font-medium mb-1.5">环径</label>
            <input v-model="form.ringGauge" type="number" placeholder="52"
              class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
          </div>
        </div>
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">产地</label>
          <select v-model="form.origin"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream focus:outline-none focus:border-cigar-gold/50 transition-colors">
            <option value="" disabled selected>选择产地</option>
            <option value="cuba">古巴</option>
            <option value="dominican">多米尼加</option>
            <option value="nicaragua">尼加拉瓜</option>
            <option value="honduras">洪都拉斯</option>
            <option value="usa">美国</option>
            <option value="other">其他</option>
          </select>
        </div>

        <div class="flex justify-end pt-2">
          <button @click="step = 2"
            class="px-6 py-2.5 rounded-xl bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50 text-sm font-semibold hover:bg-cigar-gold/30 transition-all active:scale-95"
          >下一步：烟叶配方</button>
        </div>
      </div>

      <!-- Step 2: Tobacco blend -->
      <div v-else-if="step === 2" key="s2" class="space-y-3">
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">茄衣（Wrapper）产地</label>
          <input v-model="form.wrapperOrigin" placeholder="如 Ecuador"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">茄衣品种</label>
          <input v-model="form.wrapperVariety" placeholder="如 Habano"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">茄套（Binder）</label>
          <input v-model="form.binder" placeholder="如 Dominican Republic"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">茄芯（Filler）</label>
          <input v-model="form.filler" placeholder="如 Dominican Republic"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>
        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">核心风味（逗号分隔） <span class="text-red-400">*</span></label>
          <input v-model="form.flavors" placeholder="如 雪松木,可可,胡椒,咖啡"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>

        <div class="flex justify-between pt-2">
          <button @click="step = 1"
            class="px-4 py-2.5 rounded-xl border border-cigar-light text-sm text-cigar-mute hover:text-cigar-cream transition-all"
          >上一步</button>
          <button @click="step = 3"
            class="px-6 py-2.5 rounded-xl bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50 text-sm font-semibold hover:bg-cigar-gold/30 transition-all active:scale-95"
          >下一步：提交审核</button>
        </div>
      </div>

      <!-- Step 3: Review & Submit -->
      <div v-else key="s3" class="space-y-3">
        <div class="bg-cigar-dark rounded-xl p-4 border border-cigar-light space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-cigar-mute">品牌：</span><span>{{ form.brand }}</span></div>
          <div class="flex justify-between"><span class="text-cigar-mute">系列：</span><span>{{ form.line || '-' }}</span></div>
          <div class="flex justify-between"><span class="text-cigar-mute">型号：</span><span>{{ form.vitola }}</span></div>
          <div class="flex justify-between"><span class="text-cigar-mute">尺寸：</span><span>{{ form.length }}" × {{ form.ringGauge }} RG</span></div>
          <div class="flex justify-between"><span class="text-cigar-mute">产地：</span><span>{{ originLabel }}</span></div>
          <div class="flex justify-between"><span class="text-cigar-mute">茄衣：</span><span>{{ form.wrapperOrigin }} / {{ form.wrapperVariety }}</span></div>
          <div class="flex justify-between"><span class="text-cigar-mute">风味：</span><span>{{ form.flavors }}</span></div>
        </div>

        <!-- Attribution -->
        <div class="bg-cigar-gold/5 border border-cigar-gold/20 rounded-xl p-4 text-center">
          <p class="text-cigar-gold text-xs font-semibold">审核通过后，该雪茄页面将永久署名：</p>
          <p class="text-cigar-cream font-display text-lg mt-1">由「{{ submitterName || '匿名茄友' }}」首次提供</p>
        </div>

        <div>
          <label class="block text-cigar-cream text-xs font-medium mb-1.5">你的社区用户名（将永久署名）</label>
          <input v-model="submitterName" placeholder="你的用户名"
            class="w-full px-3 py-2.5 bg-cigar-dark border border-cigar-light rounded-xl text-sm text-cigar-cream placeholder-cigar-mute focus:outline-none focus:border-cigar-gold/50 transition-colors" />
        </div>

        <!-- Submit -->
        <button @click="handleSubmit" :disabled="submitting"
          class="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
          :class="submitting
            ? 'bg-cigar-light text-cigar-mute cursor-not-allowed'
            : 'bg-cigar-gold text-cigar-dark hover:bg-cigar-gold/90'"
        >
          <span v-if="submitting">提交中...</span>
          <span v-else>确认提交审核</span>
        </button>

        <button @click="step = 2"
          class="w-full py-2 text-sm text-cigar-mute hover:text-cigar-cream transition-colors"
        >返回修改</button>

        <!-- Success state -->
        <transition name="fade">
          <div v-if="submitted" class="text-center py-6">
            <div class="text-4xl mb-3">✅</div>
            <p class="text-cigar-gold font-display text-lg">提交成功！</p>
            <p class="text-cigar-mute text-sm mt-1">审核结果将在 48 小时内通过站内信通知您</p>
            <p class="text-cigar-mute text-xs mt-4">审核通过后，你将成为「{{ form.brand }} {{ form.vitola }}」的<b class="text-cigar-gold">首发录入者</b>并获得对应勋章</p>
            <button @click="resetForm"
              class="mt-6 px-6 py-2.5 rounded-xl bg-cigar-gold/20 text-cigar-gold border border-cigar-gold/50 text-sm font-semibold hover:bg-cigar-gold/30 transition-all"
            >再提报一支</button>
          </div>
        </transition>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'

const step = ref(1)
const submitting = ref(false)
const submitted = ref(false)
const submitterName = ref('')

const form = reactive({
  brand: '',
  line: '',
  vitola: '',
  length: '',
  ringGauge: '',
  origin: '',
  wrapperOrigin: '',
  wrapperVariety: '',
  binder: '',
  filler: '',
  flavors: '',
})

const originLabel = computed(() => {
  const map = { cuba:'古巴', dominican:'多米尼加', nicaragua:'尼加拉瓜', honduras:'洪都拉斯', usa:'美国', other:'其他' }
  return map[form.origin] || form.origin
})

function handleSubmit() {
  submitting.value = true
  setTimeout(() => {
    submitting.value = false
    submitted.value = true
    step.value = 3
  }, 1200)
}

function resetForm() {
  step.value = 1
  submitted.value = false
  form.brand = ''
  form.line = ''
  form.vitola = ''
  form.length = ''
  form.ringGauge = ''
  form.origin = ''
  form.wrapperOrigin = ''
  form.wrapperVariety = ''
  form.binder = ''
  form.filler = ''
  form.flavors = ''
  submitterName.value = ''
}
</script>

<style scoped>
.fade-slide-enter-active, .fade-slide-leave-active {
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
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
