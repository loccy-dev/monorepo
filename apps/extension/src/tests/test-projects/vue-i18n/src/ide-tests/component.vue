<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

t('loading')
const stringSmall = 'loading'
const stringLarge = 'cta.cancel'
</script>

<template>
  <div>{{ t('loading') }}</div>
  <div>{{ $t('loading') }}</div>
  <i18n-t keypath="loading"></i18n-t>
</template>
