// stories/RequestListItem.stories.jsx
import React from 'react';
import RequestListItem from '../src/components/RequestListItem';

export default {
  title: 'Components/RequestListItem',
  component: RequestListItem
};

export const DefaultItem = () => (
  <RequestListItem
    request={{ method: 'GET', request: {}, response: { statusCode: 200 }, path: '/api/test', latency: 123 }}
    reqId={1}
    onSelect={() => {
    }}
    onRemove={() => {
    }}
  />
);
