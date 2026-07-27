<template>
  <h1 id="title" v-tippy="'I\'m tooltip'" :class="['hi']" :multi="{one: 'first', two: 'second'}" @click="() => alert('attention')">Title text</h1>
  <p id="id-text">
  Multiline paragraph with weird formatting
  </p>

         <span>{{ 'Hi, ' + userName }}</span>
  <p :title="`hi`">{{ $t('Test.keypath') }}</p>
  <h2>Как дел?!</h2>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  props: {},

  data() {
    return {
      greeting: "hi there! ",
    };
  },
  computed: {},
  watch: {},
  mounted() {},
  methods: {},
});
</script>

<script setup lang="ts">
const userName = 'John';
</script>

<style scoped lang="scss"></style>