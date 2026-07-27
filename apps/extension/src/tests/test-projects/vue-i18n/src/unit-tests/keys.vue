<template>
  <!-- Basic template interpolations -->
  <div>{{ $t('simple.key') }}</div>
  <div>{{ $t('double.quoted.key') }}</div>
  <div>{{ $t(`template.literal.key`) }}</div>

  <!-- With parameters -->
  <p>{{ $t('with.params', { name: 'Alice', count: 5 }) }}</p>
  <p>{{ $t('with.list', ['first', 'second', 'third']) }}</p>
  <p>{{ $t('with.number', 42) }}</p>
  <p>{{ $t('with.default', 'Default fallback message') }}</p>
  <p>{{ $t('with.locale', {}, 'en-US') }}</p>
  <p>{{ $t('with.all.params', { user: 'Bob' }, 'fr-FR') }}</p>

  <!-- In attributes -->
  <div :title="$t('attribute.title')"></div>
  <div :placeholder="$t('attribute.placeholder', { type: 'text' })"></div>
  <div :aria-label="$t('accessibility.label')"></div>

  <!-- In directives -->
  <div v-if="$t('conditional.key') === 'show'">Conditional</div>
  <div v-show="$t('visibility.key')">Visible</div>
  <div v-for="item in [$t('list.item1'), $t('list.item2')]" :key="item">{{ item }}</div>

  <!-- Complex expressions -->
  <span>{{ 'Prefix: ' + $t('concatenated.key') + ' Suffix' }}</span>
  <span>{{ `Start ${$t('embedded.in.template')} End` }}</span>
  <span>{{ $t('ternary.condition') ? $t('ternary.true') : $t('ternary.false') }}</span>

  <!-- Nested calls -->
  <div>{{                            }}</div>
  <div>{{ $t('parent.key', { child: $t('child.key') }) }}</div>

  <!-- Event handlers -->
  <button @click="$t('button.click')">Click</button>
  <button @click="() => console.log($t('arrow.function.key'))">Arrow</button>
  <button @click="handleClick($t('method.param.key'))">Method</button>

  <!-- Dynamic keys -->
  <div>{{ $t(dynamicKey) }}</div>
  <div>{{ $t(`dynamic.${suffix}`) }}</div>
  <div>{{ $t('dynamic.' + variable) }}</div>

  <!-- Special characters in keys -->
  <div>{{ $t('special-chars.with-dash') }}</div>
  <div>{{ $t('special_chars.with_underscore') }}</div>
  <div>{{ $t('special.chars.123.numbers') }}</div>
  <div>{{ $t('UPPERCASE.KEY') }}</div>

  <!-- Multiple params variations -->
  <div>{{ $t('plural.apples', 0) }}</div>
  <div>{{ $t('plural.apples', 1) }}</div>
  <div>{{ $t('plural.apples', 5) }}</div>
  <div>{{ $t('plural.custom', { count: itemCount }) }}</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  data() {
    return {
      dynamicKey: 'dynamic.from.data',
      suffix: 'suffix',
      variable: 'part',
      itemCount: 3,
      // t-function in data
      message: this.$t ? this.$t('data.initial.value') : '',
    }
  },

  computed: {
    // t-function in computed properties
    computedMessage() {
      return this.$t('computed.message')
    },
    computedWithParams() {
      return this.$t('computed.with.params', { value: 100 })
    },
    computedConditional() {
      return this.itemCount > 0
        ? this.$t('computed.has.items', this.itemCount)
        : this.$t('computed.no.items')
    },
  },

  watch: {
    // t-function in watchers
    itemCount(newVal) {
      console.log(this.$t('watcher.changed', { value: newVal }))
    },
    dynamicKey: {
      handler(newKey) {
        alert(this.$t('watcher.deep', { key: newKey }))
      },
      deep: true,
    },
  },

  mounted() {
    // t-function in lifecycle hooks
    console.log(this.$t('lifecycle.mounted'))
    const msg = this.$t('lifecycle.mounted.with.time', { time: new Date().toISOString() })

    // t-function in setTimeout/Promise
    setTimeout(() => {
      console.log(this.$t('async.timeout.message'))
    }, 1000)

    Promise.resolve().then(() => {
      return this.$t('async.promise.message')
    })
  },

  beforeUnmount() {
    console.log(this.$t('lifecycle.unmount'))
  },

  methods: {
    // t-function in methods
    handleClick(param: string) {
      console.log(this.$t('method.clicked'), param)
      return this.$t('method.return.value')
    },

    getMessage(key: string) {
      return this.$t(key)
    },

    getFormattedMessage(name: string, count: number) {
      return this.$t('method.formatted', { name, count })
    },

    // t-function in different contexts within method
    complexMethod() {
      const local = this.$t('method.local.variable')
      const array = [this.$t('method.array.item1'), this.$t('method.array.item2')]
      const object = {
        key1: this.$t('method.object.value1'),
        key2: this.$t('method.object.value2'),
      }

      // In try-catch
      try {
        throw new Error(this.$t('method.error.message'))
      } catch (e) {
        console.error(this.$t('method.catch.message'))
      }

      // In switch
      switch (this.itemCount) {
        case 0:
          return this.$t('method.switch.zero')
        case 1:
          return this.$t('method.switch.one')
        default:
          return this.$t('method.switch.many', this.itemCount)
      }
    },
  },
})
</script>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

// Using composition API
const { t, te, tm, rt, d, n } = useI18n()

// Basic usage in setup
const setupMessage = t('setup.basic.message')
const setupWithParams = t('setup.with.params', { user: 'Charlie' })

// Reactive refs with t-function
const counter = ref(0)
const counterMessage = computed(() => t('setup.counter', counter.value))

// Different i18n functions
const exists = te('setup.key.exists')
const messages = tm('setup.messages.array')
const raw = rt('setup.raw.translation')
const date = d(new Date(), 'short')
const number = n(1000.5, 'currency')

// t-function in composables
function useCustomComposable() {
  const message = t('composable.message')
  const getMessage = (key: string) => t(key)

  return {
    message,
    getMessage,
    dynamicMessage: computed(() => t('composable.dynamic', { time: Date.now() })),
  }
}

const { message: composableMsg } = useCustomComposable()

// t-function in setup lifecycle
onMounted(() => {
  console.log(t('setup.mounted'))

  // In async context
  ;(async () => {
    await Promise.resolve()
    console.log(t('setup.async.resolved'))
  })()
})

// t-function in watchers
watch(counter, (newVal) => {
  console.log(t('setup.watch.counter', { value: newVal }))
})

// Arrow functions with t
const getSetupMessage = () => t('setup.arrow.function')
const formatSetupMessage = (name: string) => t('setup.arrow.with.param', { name })

// t-function in different expression contexts
const ternaryMessage = counter.value > 0 ? t('setup.positive') : t('setup.zero')
const templateMessage = `Prefix ${t('setup.template.embedded')} Suffix`
const concatenatedMessage = 'Start ' + t('setup.concatenated') + ' End'

// Array and object with t-function
const messagesArray = [t('setup.array.0'), t('setup.array.1'), t('setup.array.2')]

const messagesObject = {
  first: t('setup.object.first'),
  second: t('setup.object.second'),
  nested: {
    deep: t('setup.object.nested.deep'),
  },
}

// Edge cases
const emptyKey = t('')
const whitespaceKey = t('  ')
const veryLongKey = t('very.long.key.path.that.goes.on.and.on.and.on.testing.limits')
const unicodeKey = t('unicode.😀.emoji')
const escapedKey = t('escaped\.dot\.in\.key')

const plainString = 'existing.key'

// not t-functions, but look like
analytics.t('event')
analytics.$t('event')
tfn('a')
fnt('a')
fn_t('a')
</script>

<style scoped lang="scss"></style>

<template>
  <i18n-t keypath="some.key"></i18n-t>
  <i18n-t :keypath="`some.` + key" />

  <!-- existing key -->
  <i18n-t keypath="AppFooter.areYouSure" />

  <!-- like dynamic but static, should not be duplicated -->
  <i18n-t :keypath="'DropdownMenu.light'"></i18n-t>
  <i18n-t :keypath="`DropdownMenu.light`"></i18n-t>

  <!-- generics inside dynamic -->
  {{ $t('part.one' + 'part.two') }}
</template>