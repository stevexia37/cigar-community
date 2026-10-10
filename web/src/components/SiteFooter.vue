<template>
  <footer class="mt-16 border-t border-cigar-light/60 bg-cigar-dark">
    <div class="mx-auto max-w-5xl px-4 py-8 text-xs text-cigar-mute">
      <div class="grid gap-6 sm:grid-cols-3">
        <div>
          <p class="font-display text-sm text-cigar-gold mb-2">雪茄客</p>
          <p class="leading-relaxed">非交易向的雪茄知识库与品吸交流社区。<br />不售烟草，不提供购买渠道。</p>
        </div>
        <div>
          <p class="mb-2 font-medium text-cigar-cream">工具</p>
          <ul class="space-y-1.5">
            <li><router-link to="/tools/diagnostic" class="hover:text-cigar-gold">病害一键诊断</router-link></li>
            <li><router-link to="/tools/flavor-test" class="hover:text-cigar-gold">风味人格测试</router-link></li>
            <li><router-link to="/tools/aging-calc" class="hover:text-cigar-gold">醇化计算器</router-link></li>
          </ul>
        </div>
        <div>
          <p class="mb-2 font-medium text-cigar-cream">关于</p>
          <ul class="space-y-1.5">
            <li><router-link to="/about" class="hover:text-cigar-gold">免责声明与社区公约</router-link></li>
            <li><router-link to="/guide/plume-vs-mold" class="hover:text-cigar-gold">起灰 vs 发霉图鉴</router-link></li>
            <li><router-link to="/submit" class="hover:text-cigar-gold">提报雪茄数据</router-link></li>
          </ul>
        </div>
      </div>

      <div class="mt-8 border-t border-cigar-light/50 pt-5 leading-relaxed">
        <p>吸烟有害健康。本网站仅面向年满 18 周岁的成年人，仅供知识交流与品鉴记录之用。</p>
        <p class="mt-1.5">站内价格均为公开资料整理的<strong class="text-cigar-cream">参考估算价</strong>，非交易报价；本站不参与任何烟草制品交易。</p>
        <p class="mt-3 text-cigar-smoke">© {{ year }} 雪茄客 · Cigar Community</p>
      </div>
    </div>
  </footer>
</template>

<script setup>
const year = new Date().getFullYear()
</script>
