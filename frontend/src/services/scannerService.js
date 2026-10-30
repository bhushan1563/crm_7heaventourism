import api from './api';

export const scannerService = {
  processScan: async (payload) => {
    // payload can be FormData (for file/camera upload) or JSON object { text, scanType }
    let res;
    if (payload instanceof FormData) {
      res = await api.post('/scanner/process', payload, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    } else {
      res = await api.post('/scanner/process', payload);
    }
    return res.data;
  }
};

export default scannerService;
