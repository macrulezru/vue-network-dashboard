<template>
  <div class="request-buttons">
    <div class="button-group">
      <h3>GET Requests</h3>
      <div class="buttons">
        <button class="btn-get" @click="fetchPosts">GET Posts</button>
        <button class="btn-get" @click="fetchUser">GET User</button>
        <button class="btn-get" @click="fetchSlow">GET Slow (2s)</button>
        <button class="btn-get" @click="fetchError">GET Error 404</button>
      </div>
    </div>

    <div class="button-group">
      <h3>Mutating Requests</h3>
      <div class="buttons">
        <button class="btn-post" @click="createPost">POST Create Post</button>
        <button class="btn-put" @click="updatePost">PUT Update Post</button>
        <button class="btn-delete" @click="deletePost">DELETE Post</button>
      </div>
    </div>

    <div class="button-group">
      <h3>GraphQL Requests</h3>
      <div class="buttons">
        <button class="btn-gql" @click="gqlGetUser">query GetUser</button>
        <button class="btn-gql" @click="gqlGetPosts">query GetPosts</button>
        <button class="btn-gql" @click="gqlCreatePost">mutation CreatePost</button>
      </div>
    </div>

    <div class="status-area" v-if="lastResponse">
      <h3>Last Response</h3>
      <pre class="response-preview">{{ lastResponse }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const lastResponse = ref<string>('')

const fetchPosts = async () => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=3')
    const data = await response.json()
    lastResponse.value = JSON.stringify(data, null, 2)
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}

const fetchUser = async () => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users/1')
    const data = await response.json()
    lastResponse.value = JSON.stringify(data, null, 2)
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}

const fetchSlow = async () => {
  try {
    const response = await fetch('https://httpbin.org/delay/2')
    const data = await response.json()
    lastResponse.value = JSON.stringify(data, null, 2)
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}

const fetchError = async () => {
  try {
    const response = await fetch('https://httpbin.org/status/404')
    lastResponse.value = `Status: ${response.status} ${response.statusText}`
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}

const createPost = async () => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Post',
        body: 'This is a test post created from the demo',
        userId: 1
      })
    })
    const data = await response.json()
    lastResponse.value = JSON.stringify(data, null, 2)
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}

const updatePost = async () => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts/1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: 1,
        title: 'Updated Post',
        body: 'This post was updated',
        userId: 1
      })
    })
    const data = await response.json()
    lastResponse.value = JSON.stringify(data, null, 2)
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}

const gql = async (operationName: string, query: string, variables?: Record<string, unknown>) => {
  try {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, operationName, variables })
    })
    const data = await response.json()
    lastResponse.value = JSON.stringify(data, null, 2)
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}

const gqlGetUser = () => gql(
  'GetUser',
  'query GetUser($id: ID!) { user(id: $id) { id name email role } }',
  { id: '1' }
)

const gqlGetPosts = () => gql(
  'GetPosts',
  'query GetPosts { posts { id title body author { name } } }'
)

const gqlCreatePost = () => gql(
  'CreatePost',
  'mutation CreatePost($input: PostInput!) { createPost(input: $input) { id title } }',
  { input: { title: 'Hello GraphQL', body: 'Demo mutation' } }
)

const deletePost = async () => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts/1', {
      method: 'DELETE'
    })
    lastResponse.value = `Status: ${response.status} ${response.statusText}`
  } catch (error) {
    lastResponse.value = `Error: ${error}`
  }
}
</script>

<style scoped lang="scss">
.request-buttons {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.button-group {
  h3 {
    font-size: 14px;
    margin: 0 0 12px 0;
    color: #9ca3af;
  }
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-get,
.btn-post,
.btn-put,
.btn-delete,
.btn-gql {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-get {
  background: #1e3a8a;
  color: #93c5fd;

  &:hover {
    background: #1e40af;
    color: #bfdbfe;
  }
}

.btn-post {
  background: #065f46;
  color: #6ee7b7;

  &:hover {
    background: #047857;
    color: #a7f3d0;
  }
}

.btn-put {
  background: #92400e;
  color: #fcd34d;

  &:hover {
    background: #b45309;
    color: #fde047;
  }
}

.btn-delete {
  background: #991b1b;
  color: #fecaca;

  &:hover {
    background: #b91c1c;
    color: #fee2e2;
  }
}

.btn-gql {
  background: #3b1f6e;
  color: #c4b5fd;

  &:hover {
    background: #4c2889;
    color: #ddd6fe;
  }
}

.status-area {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #2a2a2e;

  h3 {
    font-size: 13px;
    margin: 0 0 8px 0;
    color: #9ca3af;
  }
}

.response-preview {
  background: #1a1a1e;
  border-radius: 6px;
  padding: 12px;
  font-size: 11px;
  font-family: monospace;
  overflow-x: auto;
  max-height: 200px;
  margin: 0;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
}
</style>