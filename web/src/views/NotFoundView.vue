<template>
  <div class="mx-auto max-w-2xl px-4 pb-16 pt-14">
    <div class="cc-card p-8 text-center anim-slide-up">
      <div class="font-display text-5xl text-cigar-gold">404</div>
      <h1 class="mt-4 font-display text-xl text-cigar-cream">这页雪茄抽完了</h1>
      <p class="mt-2 text-sm leading-relaxed text-cigar-mute">
        你要找的页面不存在，可能链接输错了，或者它已经被下架。<br />
        回首页坐坐，或者去数据库翻翻别的。
      </p>

      <div class="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <router-link to="/" class="cc-btn-primary">🏠 返回首页</router-link>
        <router-link to="/cigars" class="cc-btn-ghost">📚 去雪茄数据库</router-link>
      </div>

      <div class="mt-8 border-t border-cigar-light/50 pt-4 text-[11px] text-cigar-smoke">
        也可以试试：
        <router-link to="/tools/diagnostic" class="text-cigar-mute hover:text-cigar-gold">病害诊断</router-link>
        <span class="mx-1.5 text-cigar-light">·</span>
        <router-link to="/reviews" class="text-cigar-mute hover:text-cigar-gold">品吸笔记</router-link>
        <span class="mx-1.5 text-cigar-light">·</span>
        <router-link to="/about" class="text-cigar-mute hover:text-cigar-gold">免责声明</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
// 404 页：只做导航引导，无数据请求
</script>
