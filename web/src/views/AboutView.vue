<template>
  <div class="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:pt-8">
    <header>
      <h1 class="font-display text-2xl text-cigar-cream sm:text-3xl">关于雪茄客</h1>
      <p class="mt-2 text-sm leading-relaxed text-cigar-mute">
        一个非交易向的雪茄知识库与品吸交流社区。我们不做买卖，只做记录与讨论 ——
        让每一支雪茄的味道、每一次养坏的教训，都能被后来的人看到。
      </p>
    </header>

    <!-- 红线速览 -->
    <section class="cc-card mt-6 border-cigar-gold/30 p-5">
      <h2 class="font-display text-base text-cigar-gold">三条红线</h2>
      <ul class="mt-3 space-y-2 text-sm leading-relaxed text-cigar-cream">
        <li>1. 本社区<span class="text-cigar-gold">仅限 18 周岁以上成年人</span>访问与使用。</li>
        <li>2. 本社区<span class="text-cigar-gold">不售卖任何烟草制品</span>，不提供、不撮合任何购买渠道。</li>
        <li>3. 站内<span class="text-cigar-gold">禁止一切交易类信息</span>，包括代购、拼单、报价、私聊加微信等。</li>
      </ul>
    </section>

    <!-- 分段条款 -->
    <section
      v-for="section in sections"
      :key="section.title"
      class="mt-8 border-t border-cigar-light/50 pt-6"
    >
      <h2 class="font-display text-lg text-cigar-cream">{{ section.title }}</h2>
      <p v-if="section.intro" class="mt-2 text-sm leading-relaxed text-cigar-mute">{{ section.intro }}</p>

      <ul class="mt-3 space-y-2 text-sm leading-relaxed text-cigar-mute">
        <li v-for="(item, i) in section.items" :key="i" class="flex gap-2">
          <span class="mt-[2px] text-cigar-gold/70" aria-hidden="true">·</span>
          <span>{{ item }}</span>
        </li>
      </ul>
    </section>

    <!-- 联系方式占位 -->
    <section class="mt-8 border-t border-cigar-light/50 pt-6">
      <h2 class="font-display text-lg text-cigar-cream">联系我们</h2>
      <div class="cc-card mt-3 p-4 text-sm leading-relaxed text-cigar-mute">
        <p>内容纠错 / 侵权投诉 / 账号申诉：<span class="text-cigar-smoke">（联系方式待补充，占位）</span></p>
        <p class="mt-1.5">数据提报：<router-link to="/submit" class="text-cigar-gold hover:underline">提报雪茄数据</router-link></p>
        <p class="mt-1.5 text-xs text-cigar-smoke">
          我们会在收到有效通知后尽快核实处理。请勿通过任何渠道向本站询问购买方式，此类询问一律不予回复。
        </p>
      </div>
    </section>

    <p class="mt-8 text-center text-[11px] leading-relaxed text-cigar-smoke">
      最后更新：{{ updatedAt }}<br />
      本页内容如与法律法规冲突，以法律法规为准。
    </p>
  </div>
</template>

<script setup>
const updatedAt = '2026-06'

const sections = [
  {
    title: '一、年龄限制（18+）',
    intro: '烟草相关内容仅适合成年人阅读。',
    items: [
      '本网站面向年满 18 周岁的成年人。首次访问需通过年龄确认，确认状态以 Cookie 形式保存 30 天。',
      '未满 18 周岁者请立即离开本站；如发现未成年人使用本站，请通过下方联系方式告知，我们将配合处理。',
      '吸烟有害健康，包括但不限于成瘾、呼吸系统与心血管系统疾病风险。本站内容不构成任何健康建议。',
      '请遵守你所在国家或地区的法律法规，请勿在禁烟场所吸烟。',
    ],
  },
  {
    title: '二、非交易属性声明',
    intro: '本社区从产品设计上就不是一个交易平台。',
    items: [
      '本站不销售任何烟草制品，不提供价格报价、库存、链接、渠道或代购信息，也不参与任何形式的撮合与担保。',
      '本站不提供购买渠道，任何声称「通过本站可购买」的说法均与本站无关。',
      '站内所有品牌名、商标归其各自权利人所有，仅用于知识性描述与讨论。',
      '如你所在地区禁止此类内容的展示，请停止使用本站。',
    ],
  },
  {
    title: '三、参考价说明',
    intro: '页面上的价格数字不是报价。',
    items: [
      '站内价格字段（如「¥35」）均为依据公开资料整理的参考估算价，用于横向比较，非交易报价。',
      '参考价可能滞后、失真或存在地区差异，不构成任何要约、承诺或交易依据。',
      '本站不会因为你的浏览行为向你推送任何购买入口。',
    ],
  },
  {
    title: '四、社区公约与内容审核',
    intro: '发言前请先读这一段，违规成本很高。',
    items: [
      '禁止发布任何交易类信息，包括但不限于：代购、拼单、团购、转手、报价、询价、渠道、货源、免税、代收、私聊加微信/QQ/Telegram 等。',
      '禁止发布联系方式以引导私下交易；禁止诱导他人添加社交账号。',
      '禁止发布与烟草无关的广告、推广、引流内容，禁止刷屏与恶意营销。',
      '禁止人身攻击、地域歧视、色情低俗、违法违禁品相关内容。',
      '本站对用户投稿内容进行敏感词与技术审核：命中红线的文字将被直接拒绝且不入库；命中审核词的文字将进入人工审核队列，通过后才会公开显示。',
      '违规内容将被删除，账号将被警告、限制发言直至永久封禁；情节严重者将保留证据并向有关部门报告。',
      '请理性讨论，尊重不同的口味偏好 —— 味道没有标准答案。',
    ],
  },
  {
    title: '五、内容版权与用户投稿授权',
    intro: '你写的东西仍属于你，但需要授权我们展示。',
    items: [
      '本站的数据库结构、页面设计、原创图表与整理性内容，版权归本站所有，转载请注明来源并保留链接。',
      '用户发布的品吸笔记、评论、评分与提报数据，著作权归用户本人所有。',
      '用户发布内容即授予本站一项全球范围、免费、非独占的许可，用于在本站及相关页面中存储、展示、排版、节选与推广。',
      '用户须保证其发布内容为原创或已获得合法授权，不含侵犯第三方著作权、商标权或隐私权的内容。',
      '如你认为站内内容侵犯了你的合法权益，请提供权属证明与具体链接，我们会及时核实并删除。',
      '用户内容仅代表发布者个人观点，不代表本站立场。',
    ],
  },
  {
    title: '六、免责声明',
    intro: '我们会尽力保证信息准确，但无法保证。',
    items: [
      '本站内容（含病害诊断、醇化计算等工具的结论）均为经验性参考，不构成专业鉴定意见、医疗建议或质量承诺。',
      '本站不对因使用站内信息而产生的任何直接或间接损失承担责任。',
      '服务可能因维护、升级或不可抗力而中断，本站不对此承担赔偿责任。',
      '本声明的解释与适用以本站运营者所在地法律为准。',
    ],
  },
]
</script>
