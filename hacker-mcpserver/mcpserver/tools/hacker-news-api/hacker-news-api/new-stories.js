/**
 * Function to fetch new stories from Hacker News.
 *
 * @returns {Promise<Array>} - A promise that resolves to an array of new story IDs.
 */
const executeFunction = async () => {
  const baseUrl = 'https://hacker-news.firebaseio.com';
  try {
    // Construct the URL for new stories
    const url = `${baseUrl}/v0/newstories.json?print=pretty`;

    // Perform the fetch request
    const response = await fetch(url, {
      method: 'GET'
    });

    // Check if the response was successful
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }

    // Parse and return the response data
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching new stories:', error);
    return {
      error: `An error occurred while fetching new stories: ${error instanceof Error ? error.message : JSON.stringify(error)}`
    };
  }
};

/**
 * Tool configuration for fetching new stories from Hacker News.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'fetch_new_stories',
      description: 'Fetch new stories from Hacker News.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
};

export { apiTool };