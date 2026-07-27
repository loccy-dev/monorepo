<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  prefix: 'dashboard' | 'dashboard.cards.sales'
}>()

let saveOrCancel: 'save' | 'cancel' = 'save'
if (Math.random() > 0.5) {
  saveOrCancel = 'cancel'
}

const cancel = 'cancel'

enum SaveCancel {
  Save = 'save',
  Cancel = 'cancel',
}
const saveOrCancelEnum: SaveCancel = Math.random() > 0.5 ? SaveCancel.Cancel : SaveCancel.Save

const anyValue = Math.random().toString()

const btnTitle = 'cta.save'

const translation1 = t('cta.' + saveOrCancel)
const translation2 = t(`cta.${saveOrCancel}`)

const upOrDown = Math.random() > 0.5 ? 'up' : 'down'
</script>

<template>
  <div>
    <!-- static -->
    {{ $t('cta.save') }}

    <!-- defined options -->
    {{ $t('cta.' + saveOrCancel) }}
    {{ $t(`cta.` + cancel) }}
    {{ $t('cta.' + saveOrCancel) }}
    {{ $t(`cta.${saveOrCancel}`) }}
    {{ $t(`cta.${saveOrCancelEnum}`) }}
    {{ $t(`${props.prefix}.title`) }}
    {{ $t(`${prefix}.title`) }}
    {{ $t(`dashboard.cards.sales.trend.${upOrDown}`) }}

    <i18n-t :keypath="`cta.${saveOrCancel}`"></i18n-t>

    <!-- undefined options -->
    {{ $t(`cta.${anyValue}`) }}
    {{ $t(anyValue) }}
    {{ $t(`${prefix}.nonExisting`) }}
    {{ $t(`${prefix}.subtitle.nonExisting`) }}

    <!-- defined, var only -->
    {{ $t(btnTitle) }}
  </div>
</template>

<style scoped lang="scss"></style>
