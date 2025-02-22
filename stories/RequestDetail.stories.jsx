// stories//RequestDetail.stories.jsx
import React from 'react';
import RequestDetail from '../src/components/RequestDetail';

export default {
  title: 'Components/RequestDetail',
  component: RequestDetail
};

export const DefaultRequestDetail = () => (
  <RequestDetail request={{
    method: 'GET',
    request: {},
    response: { statusCode: 200 },
    path: '/api/test',
    url: 'http://example.com/api/test',
    timestamp: '2024-02-09T12:00:00Z',
    latency: 150
  }} />
);