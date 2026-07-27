<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const languages = ['en', 'de', 'ru'] as const

function changeLocale(lng: string) {
  locale.value = lng
}
</script>

<template>
  <div>
    <div style="margin-bottom: 20px">
      <button
        v-for="lng in languages"
        :key="lng"
        @click="changeLocale(lng)"
        :style="{ marginRight: '8px', fontWeight: locale === lng ? 'bold' : 'normal' }"
      >
        {{ lng.toUpperCase() }}
      </button>
    </div>

    <hr />

    <p>{{ t('welcomeByName', { name: 'John' }) }}</p>

    <i18n-t keypath="welcomeByNameAndPage" tag="p">
      <template #page><em>Home</em></template>
      <template #name><strong>Bob</strong></template>
    </i18n-t>

    <br />
    <p>{{ t('plural', 0) }}</p>
    <p>{{ t('plural', 1) }}</p>
    <p>{{ t('plural', 2) }}</p>
    <p>{{ t('plural', 5) }}</p>
    <br />

    <p>{{ t('dashboard.poweredBy') }}</p>
  </div>
</template>

<style scoped></style>
