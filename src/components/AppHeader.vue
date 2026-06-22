<script setup lang="ts">
const appVersion = __APP_VERSION__

const emit = defineEmits<{
  'pick-files': []
}>()
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">3D</span>
      <div class="brand-copy">
        <h1>GLB / GLTF 檢視器</h1>
        <p>本機檔案直接檢視，不上傳模型資料。v{{ appVersion }}</p>
      </div>
    </div>

    <button class="primary-button" type="button" @click="emit('pick-files')">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </svg>
      選擇模型
    </button>
  </header>
</template>

<style scoped>
@reference "../style.css";

.topbar {
  @apply flex min-h-[72px] items-center justify-between gap-5 border-b border-line px-[18px] py-3.5;
  background: rgba(17, 20, 24, 0.96);
}

.brand {
  @apply flex min-w-0 items-center gap-3;
}

.brand-mark {
  @apply inline-grid h-[42px] w-[42px] shrink-0 place-items-center rounded-default border text-sm font-extrabold text-accent-strong;
  border-color: rgba(76, 201, 166, 0.45);
  background: var(--color-brand-mark-bg);
}

.brand-copy {
  @apply min-w-0;
}

.brand-copy h1 {
  @apply m-0 overflow-hidden text-lg leading-tight font-[750] text-ellipsis whitespace-nowrap text-text;
}

.brand-copy p {
  @apply mt-[3px] mb-0 text-[13px] text-text-muted;
}

.primary-button {
  @apply inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-default px-[15px] font-bold whitespace-nowrap text-accent-text transition-[background-color] duration-150;
  background: var(--color-accent);
}

.primary-button:hover {
  background: var(--color-accent-strong);
}

.primary-button svg {
  @apply h-5 w-5 fill-none stroke-current;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

@media (max-width: 980px) {
  .topbar {
    @apply min-h-0 flex-col items-start;
  }

  .primary-button {
    @apply w-full;
  }
}

@media (max-width: 560px) {
  .topbar {
    @apply p-3;
  }

  .brand-copy h1 {
    @apply whitespace-normal;
  }
}
</style>
