// 인스타그램 자동 포스팅 - 향후 API 연동 시 활성화
// 현재: 수동 다운로드 방식으로 전환됨

/*
const INSTAGRAM_API_URL = 'https://graph.facebook.com/v18.0'

interface PostResult {
  id: string
  success: boolean
  error?: string
}

export async function postToInstagram(imageUrl: string, caption: string): Promise<PostResult> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

  if (!accessToken || !businessAccountId) {
    return { id: '', success: false, error: 'Instagram API 설정이 필요합니다.' }
  }

  try {
    const containerResponse = await fetch(`${INSTAGRAM_API_URL}/${businessAccountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken })
    })

    const containerData = await containerResponse.json()
    if (!containerData.id) {
      return { id: '', success: false, error: containerData.error?.message || '컨테이너 생성 실패' }
    }

    const publishResponse = await fetch(`${INSTAGRAM_API_URL}/${businessAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken })
    })

    const publishData = await publishResponse.json()
    if (publishData.id) {
      return { id: publishData.id, success: true }
    }

    return { id: '', success: false, error: publishData.error?.message || '포스팅 실패' }
  } catch (error) {
    return { id: '', success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' }
  }
}
*/

export {}
